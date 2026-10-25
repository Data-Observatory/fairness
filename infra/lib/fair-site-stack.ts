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

/**
 * Static hosting for the FAIR Resources Finder: a private S3 bucket (read only through
 * CloudFront Origin Access Control), a CloudFront distribution with a viewer-request
 * function that maps extensionless links onto the flat .html files of the static build,
 * security response headers, and a BucketDeployment that uploads ../build and
 * invalidates the distribution.
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

		new s3deploy.BucketDeployment(this, 'DeploySite', {
			sources: [s3deploy.Source.asset(path.join(__dirname, '../../build'))],
			destinationBucket: bucket,
			distribution,
			distributionPaths: ['/*'],
			prune: true
		});

		new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
		new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
		new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
		new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
		new CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` });
	}
}
