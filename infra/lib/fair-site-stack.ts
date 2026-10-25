import * as path from 'path';
import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface FairSiteStackProps extends StackProps {
	/** Public domain the site is served under, e.g. "fair.dataobservatory.net". */
	domainName: string;
}

// The built pages need one inline bootstrap script and inline styles, plus same-origin
// modules, CSS, fonts and data fetches. The site makes no third-party requests, so no
// external host appears in the policy.
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'"
].join('; ');

const IMMUTABLE_PREFIX = '_app/immutable';

// Browser features the site never uses are denied for the page and any embedded frame.
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

/**
 * Static hosting for the FAIR Resources Finder: a private S3 bucket (read only through
 * CloudFront Origin Access Control), a CloudFront distribution with a viewer-request
 * function that maps extensionless links onto the flat .html files of the static build,
 * security response headers, and two BucketDeployments that upload ../build (immutable
 * assets with a one-year Cache-Control, everything else revalidated) and invalidate the
 * distribution.
 *
 * DNS is deliberately not managed here: the DNS zone for dataobservatory.net lives in a
 * different account, so the stack manages no Route 53 records. The certificate
 * validation CNAME and the alias A record are created by hand; see infra/README.md.
 */
export class FairSiteStack extends Stack {
	constructor(scope: Construct, id: string, props: FairSiteStackProps) {
		super(scope, id, props);

		const bucket = new s3.Bucket(this, 'SiteBucket', {
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: RemovalPolicy.RETAIN
		});

		const certificate = new acm.Certificate(this, 'Certificate', {
			domainName: props.domainName,
			validation: acm.CertificateValidation.fromDns()
			// No hostedZone: the zone is in a different account. CloudFormation waits at this
			// resource until the validation CNAME exists.
		});

		const rewriteFn = new cloudfront.Function(this, 'RewriteExtensionlessUris', {
			runtime: cloudfront.FunctionRuntime.JS_2_0,
			code: cloudfront.FunctionCode.fromFile({
				filePath: path.join(__dirname, '../cloudfront-fn/rewrite-uri.js')
			}),
			comment: 'Appends .html to extensionless request URIs for the static SvelteKit build'
		});

		const headersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
			comment: 'Security headers for the static site',
			securityHeadersBehavior: {
				strictTransportSecurity: {
					accessControlMaxAge: Duration.days(365),
					includeSubdomains: true,
					override: true
				},
				contentTypeOptions: { override: true },
				frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
				referrerPolicy: {
					referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
					override: true
				},
				contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true }
			},
			customHeadersBehavior: {
				customHeaders: [{ header: 'Permissions-Policy', value: PERMISSIONS_POLICY, override: true }]
			}
		});

		const distribution = new cloudfront.Distribution(this, 'Distribution', {
			domainNames: [props.domainName],
			certificate,
			defaultRootObject: 'index.html',
			httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
			minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
			defaultBehavior: {
				origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
				responseHeadersPolicy: headersPolicy,
				functionAssociations: [
					{
						function: rewriteFn,
						eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
					}
				]
			},
			errorResponses: [
				{
					httpStatus: 403, // a missing key behind OAC comes back as 403, not 404
					responseHttpStatus: 404,
					responsePagePath: '/404.html',
					ttl: Duration.minutes(5)
				},
				{
					httpStatus: 404,
					responseHttpStatus: 404,
					responsePagePath: '/404.html',
					ttl: Duration.minutes(5)
				}
			]
		});

		// Two deployments of the same ../build source; each file is uploaded by exactly one.
		const buildSource = s3deploy.Source.asset(path.join(__dirname, '../../build'));

		// Fingerprinted assets: content-hashed file names, safe to cache for a year. Not pruned:
		// a page cached by a browser or by CloudFront can still import a chunk from a previous
		// build, so old chunks must stay in the bucket. No invalidation is needed for new names.
		const immutableDeployment = new s3deploy.BucketDeployment(this, 'DeployImmutableAssets', {
			sources: [buildSource],
			destinationBucket: bucket,
			exclude: ['*'],
			include: [`${IMMUTABLE_PREFIX}/*`],
			cacheControl: [
				s3deploy.CacheControl.setPublic(),
				s3deploy.CacheControl.maxAge(Duration.days(365)),
				s3deploy.CacheControl.immutable()
			],
			prune: false
		});

		// Everything else (html, __data.json, favicon, robots.txt, 404.html) keeps stable names
		// and changes between builds: always revalidate, prune removed files (never touching
		// the immutable prefix, which this deployment excludes) and invalidate the CDN.
		const pagesDeployment = new s3deploy.BucketDeployment(this, 'DeploySite', {
			sources: [buildSource],
			destinationBucket: bucket,
			exclude: [`${IMMUTABLE_PREFIX}/*`],
			cacheControl: [
				s3deploy.CacheControl.setPublic(),
				s3deploy.CacheControl.maxAge(Duration.seconds(0)),
				s3deploy.CacheControl.mustRevalidate()
			],
			distribution,
			distributionPaths: ['/*'],
			prune: true
		});
		// New chunks land before pages that reference them.
		pagesDeployment.node.addDependency(immutableDeployment);

		new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
		new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
		new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
		new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
		new CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` });
	}
}
