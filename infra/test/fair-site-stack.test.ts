import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { FairSiteStack } from '../lib/fair-site-stack';

const DOMAIN = 'fair.example.test';

// Pinned on purpose. The built pages need, and only need:
// - one inline <script> (SvelteKit bootstrap with the serialized page data) -> 'unsafe-inline'
//   (a per-page hash cannot be set in a static response headers policy);
// - inline style attributes and the inline <style> block of 404.html -> 'unsafe-inline';
// - same-origin module imports, CSS, fonts (/_app/immutable/assets/*.woff2) and __data.json fetches.
// The site makes no third-party requests, so no external host appears anywhere.
const EXPECTED_CSP = [
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

let template: Template;
let outdir: string;

beforeAll(() => {
	outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-site-synth-'));
	const app = new App({ outdir });
	const stack = new FairSiteStack(app, 'FairSiteStack', {
		domainName: DOMAIN,
		env: { account: '111111111111', region: 'us-east-1' }
	});
	template = Template.fromStack(stack);
});

describe('S3 bucket', () => {
	it('is private: all four BlockPublicAccess flags', () => {
		template.hasResourceProperties('AWS::S3::Bucket', {
			PublicAccessBlockConfiguration: {
				BlockPublicAcls: true,
				BlockPublicPolicy: true,
				IgnorePublicAcls: true,
				RestrictPublicBuckets: true
			}
		});
	});

	it('has exactly one site bucket', () => {
		template.resourceCountIs('AWS::S3::Bucket', 1);
	});

	it('uses server-side encryption', () => {
		template.hasResourceProperties('AWS::S3::Bucket', {
			BucketEncryption: {
				ServerSideEncryptionConfiguration: [
					Match.objectLike({ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } })
				]
			}
		});
	});

	it('is retained on stack deletion (as in the reference)', () => {
		template.hasResource('AWS::S3::Bucket', {
			DeletionPolicy: 'Retain',
			UpdateReplacePolicy: 'Retain'
		});
	});

	it('denies non-TLS access through the bucket policy (enforceSSL)', () => {
		template.hasResourceProperties('AWS::S3::BucketPolicy', {
			PolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Effect: 'Deny',
						Principal: { AWS: '*' },
						Condition: { Bool: { 'aws:SecureTransport': 'false' } }
					})
				])
			}
		});
	});
});

describe('CloudFront origin access', () => {
	it('uses Origin Access Control, not the legacy OAI', () => {
		template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
		template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
			OriginAccessControlConfig: Match.objectLike({
				OriginAccessControlOriginType: 's3',
				SigningBehavior: 'always',
				SigningProtocol: 'sigv4'
			})
		});
		template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 0);
	});

	it('lets only CloudFront read the bucket, scoped to the distribution', () => {
		template.hasResourceProperties('AWS::S3::BucketPolicy', {
			PolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Effect: 'Allow',
						Principal: { Service: 'cloudfront.amazonaws.com' },
						Action: 's3:GetObject',
						Condition: { StringEquals: { 'AWS:SourceArn': Match.anyValue() } }
					})
				])
			}
		});
	});
});

describe('ACM certificate', () => {
	it('is issued for the domain with DNS validation', () => {
		template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
		template.hasResourceProperties('AWS::CertificateManager::Certificate', {
			DomainName: DOMAIN,
			ValidationMethod: 'DNS'
		});
	});
});

describe('CloudFront distribution', () => {
	it('is a single distribution with the domain as its only alias, using the certificate', () => {
		template.resourceCountIs('AWS::CloudFront::Distribution', 1);
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: Match.objectLike({
				Aliases: [DOMAIN],
				ViewerCertificate: Match.objectLike({
					AcmCertificateArn: { Ref: Match.stringLikeRegexp('^Certificate') },
					SslSupportMethod: 'sni-only'
				})
			})
		});
	});

	it('redirects HTTP to HTTPS, requires TLS 1.2 or newer, serves index.html at the root', () => {
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: Match.objectLike({
				DefaultRootObject: 'index.html',
				DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
				ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: 'TLSv1.2_2021' })
			})
		});
	});

	it('allows HTTP/2 and HTTP/3', () => {
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: Match.objectLike({ HttpVersion: 'http2and3' })
		});
	});

	it('maps 403 and 404 to /404.html with status 404', () => {
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: Match.objectLike({
				CustomErrorResponses: Match.arrayEquals([
					Match.objectLike({ ErrorCode: 403, ResponseCode: 404, ResponsePagePath: '/404.html' }),
					Match.objectLike({ ErrorCode: 404, ResponseCode: 404, ResponsePagePath: '/404.html' })
				])
			})
		});
	});

	it('runs a CloudFront Function on viewer-request', () => {
		template.resourceCountIs('AWS::CloudFront::Function', 1);
		template.hasResourceProperties('AWS::CloudFront::Function', {
			FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
			FunctionCode: Match.stringLikeRegexp('function handler\\(event\\)')
		});
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: Match.objectLike({
				DefaultCacheBehavior: Match.objectLike({
					FunctionAssociations: [
						Match.objectLike({
							EventType: 'viewer-request',
							FunctionARN: { 'Fn::GetAtt': [Match.stringLikeRegexp('Rewrite'), 'FunctionARN'] }
						})
					]
				})
			})
		});
	});
});

describe('security response headers', () => {
	function policyConfig() {
		const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy');
		const ids = Object.keys(policies);
		expect(ids).toHaveLength(1);
		return {
			id: ids[0],
			security: policies[ids[0]].Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
		};
	}

	it('attaches one response headers policy to the default behavior', () => {
		const { id } = policyConfig();
		template.hasResourceProperties('AWS::CloudFront::Distribution', {
			DistributionConfig: Match.objectLike({
				DefaultCacheBehavior: Match.objectLike({ ResponseHeadersPolicyId: { Ref: id } })
			})
		});
	});

	it('sets HSTS, nosniff, frame deny and the referrer policy', () => {
		const { security } = policyConfig();
		expect(security.StrictTransportSecurity).toMatchObject({
			AccessControlMaxAgeSec: 31536000,
			IncludeSubdomains: true,
			Override: true
		});
		expect(security.StrictTransportSecurity.Preload ?? false).toBe(false);
		expect(security.ContentTypeOptions).toMatchObject({ Override: true });
		expect(security.FrameOptions).toMatchObject({ FrameOption: 'DENY', Override: true });
		expect(security.ReferrerPolicy).toMatchObject({
			ReferrerPolicy: 'strict-origin-when-cross-origin',
			Override: true
		});
	});

	it('pins the Content-Security-Policy', () => {
		const { security } = policyConfig();
		expect(security.ContentSecurityPolicy).toMatchObject({
			ContentSecurityPolicy: EXPECTED_CSP,
			Override: true
		});
	});

	it('has default-src self and no third-party host in the CSP', () => {
		const csp: string = policyConfig().security.ContentSecurityPolicy.ContentSecurityPolicy;
		expect(csp).toContain("default-src 'self'");
		expect(csp).not.toMatch(/https?:/);
		expect(csp).not.toMatch(/\*/);
		expect(csp).not.toContain("'unsafe-eval'");
	});
});

describe('site deployment', () => {
	it('uploads the build and invalidates the distribution', () => {
		template.resourceCountIs('Custom::CDKBucketDeployment', 1);
		template.hasResourceProperties('Custom::CDKBucketDeployment', {
			DestinationBucketName: Match.anyValue(),
			DistributionId: { Ref: Match.stringLikeRegexp('^Distribution') },
			DistributionPaths: ['/*'],
			Prune: true
		});
	});

	it('takes its source from ../build (the SvelteKit static output)', () => {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(outdir, 'FairSiteStack.assets.json'), 'utf8')
		) as { files: Record<string, { source: { path: string } }> };
		const dirs = Object.values(manifest.files)
			.map((f) => path.join(outdir, f.source.path))
			.filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
		const siteAsset = dirs.find((d) => fs.existsSync(path.join(d, 'en.html')));
		expect(siteAsset, 'no asset directory containing en.html (run npm run build first)').toBeDefined();
		for (const file of ['index.html', 'es.html', '404.html', 'en/about.html']) {
			expect(fs.existsSync(path.join(siteAsset!, file)), file).toBe(true);
		}
	});
});

describe('outputs', () => {
	it.each(['DistributionDomainName', 'DistributionId', 'BucketName'])('exports %s', (name) => {
		template.hasOutput(name, { Value: Match.anyValue() });
	});

	it('does not emit the certificate validation note output', () => {
		expect(Object.keys(template.toJSON().Outputs ?? {})).not.toContain('CertificateValidationNote');
	});
});

describe('bin/infra.ts', () => {
	const bin = fs.readFileSync(path.join(__dirname, '../bin/infra.ts'), 'utf8');

	it('reads the domainName context with the fair.dataobservatory.net default', () => {
		expect(bin).toMatch(/tryGetContext\(\s*['"]domainName['"]\s*\)/);
		expect(bin).toContain('fair.dataobservatory.net');
		expect(bin).toContain('FairSiteStack');
	});

	it('deploys to us-east-1 and takes the account from the environment, never a literal', () => {
		expect(bin).toContain("region: 'us-east-1'");
		expect(bin).toContain('CDK_DEFAULT_ACCOUNT');
	});
});
