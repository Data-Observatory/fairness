# FAIR Resources Finder site infrastructure (CDK)

Deploys the static site (SvelteKit adapter-static output in `../build`) to S3 + CloudFront.

Domain: `fair.dataobservatory.net` (default; override with `-c domainName=...`). Stack id: `FairSiteStack`.

## Account topology (read this first)

Two AWS accounts are involved:

- the app account, where this stack is deployed (profile placeholder `<app-profile>`);
- the DNS account, which holds the Route 53 hosted zone (profile placeholder `<dns-profile>`, zone id placeholder `<hosted-zone-id>`).

The DNS zone for dataobservatory.net lives in a different account, so the stack manages no Route 53 records. CDK cannot write cross-account DNS records on its own. Two records are created by hand, against the DNS account, and nothing else there:

1. ACM validation CNAME. `cdk deploy` waits at the `Certificate` resource until a DNS validation record exists. While it waits, read the pending record in the app account and create it in the DNS account:

   ```sh
   aws acm list-certificates --profile <app-profile> --region us-east-1 \
     --query "CertificateSummaryList[?DomainName=='fair.dataobservatory.net'].CertificateArn" --output text

   aws acm describe-certificate --profile <app-profile> --region us-east-1 \
     --certificate-arn <certificate-arn> \
     --query "Certificate.DomainValidationOptions[0].ResourceRecord"

   # then, in the DNS account, with the Name and Value printed above:
   aws route53 change-resource-record-sets --profile <dns-profile> \
     --hosted-zone-id <hosted-zone-id> \
     --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":
       {"Name":"<Name>","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"<Value>"}]}}]}'
   ```

   The deploy continues once ACM validates the record (usually a few minutes).

2. CloudFront alias A record. After the distribution exists (stack output `DistributionDomainName`), point the domain at it:

   ```sh
   aws route53 change-resource-record-sets --profile <dns-profile> \
     --hosted-zone-id <hosted-zone-id> \
     --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":
       {"Name":"fair.dataobservatory.net","Type":"A","AliasTarget":
         {"HostedZoneId":"Z2FDTNDATAQYW2","DNSName":"<DistributionDomainName>","EvaluateTargetHealth":false}}}]}'
   ```

   `Z2FDTNDATAQYW2` is the fixed, global hosted zone id CloudFront uses for alias records.

## What this stack creates

- A private S3 bucket: all public access blocked, TLS enforced, S3-managed encryption, retained on stack deletion. Readable only through CloudFront Origin Access Control, scoped to the distribution.
- An ACM certificate for the domain (DNS validation, no Route 53 record managed here).
- A CloudFront distribution: the domain as its only alias, HTTP to HTTPS redirect, TLS 1.2 (2021 policy) or newer, HTTP/2 and HTTP/3, `index.html` as root object.
- A CloudFront Function (`cloudfront-fn/rewrite-uri.js`, viewer-request) that maps extensionless paths such as `/en/about` onto the flat files of the static build (`/en/about.html`).
- Custom error responses: 403 and 404 serve `/404.html` with status 404.
- A response headers policy: HSTS (one year, includeSubdomains, no preload), nosniff, frame deny, referrer policy `strict-origin-when-cross-origin`, a Content-Security-Policy limited to same-origin sources (no third-party hosts), and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- Two `BucketDeployment`s of `../build` (see Caching).

Outputs: `DistributionDomainName`, `DistributionId`, `BucketName`, `CertificateArn`, `SiteUrl`.

## Caching

The build is uploaded by two `BucketDeployment`s with the same `../build` source. Include and exclude filters make each file belong to exactly one of them.

| Deployment              | Files                                                                    | Cache-Control                         | Prune | Invalidation |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------- | ----- | ------------ |
| `DeployImmutableAssets` | `_app/immutable/**` (content-hashed names)                               | `public, max-age=31536000, immutable` | no    | none         |
| `DeploySite`            | everything else (html, `__data.json`, favicon, `robots.txt`, `404.html`) | `public, max-age=0, must-revalidate`  | yes   | `/*`         |

Prune is off for the immutable deployment on purpose: a page cached by a browser or by CloudFront can still import a chunk from a previous build, so old chunks must stay in the bucket after a new deploy. The second deployment excludes `_app/immutable/*`, so its prune never deletes them. It also depends on the first, so new chunks are uploaded before the pages that reference them. Invalidation is only needed for the files whose names do not change, so only the second deployment invalidates.

Old chunks accumulate. Remove them manually (or with an S3 lifecycle rule) if storage grows.

## Build, test and synth (no AWS calls)

```sh
# from the repo root: the static build is the deployment source
npm run build            # honors BASE_PATH if the site is served under a sub-path

cd infra
npm ci
npx tsc --noEmit
npx vitest run
CDK_DEFAULT_ACCOUNT=111111111111 CDK_DEFAULT_REGION=us-east-1 \
  npx cdk synth -c domainName=fair.example.test
```

Synth with dummy values only. The account id is read from `CDK_DEFAULT_ACCOUNT`; no account id, ARN or profile name is stored in tracked files.

## Deploying (manual, creates real billable AWS resources)

Run by the repository owner only, never by CI or an automated agent in v1.

```sh
# 1. Build the site (repo root)
npm run build

# 2. Deploy (infra directory)
cd infra
npx cdk bootstrap --profile <app-profile>   # first time only, per account and region; MANUAL, BILLABLE
npx cdk diff --profile <app-profile>        # review the changes first
npx cdk deploy --profile <app-profile>      # MANUAL, BILLABLE: creates real AWS resources
```

Create the two DNS records above while the deploy runs. Redeploying after a content or code change repeats step 1 and `cdk deploy`: `BucketDeployment` re-syncs `build/` and invalidates the CDN.

## Changing the domain

```sh
npx cdk deploy --profile <app-profile> -c domainName=<other-name>.dataobservatory.net
```

The DNS records change accordingly.

## Current deployment state

- The stack `FairSiteStack` is deployed (us-east-1, the app account). Outputs are available with `aws cloudformation describe-stacks --stack-name FairSiteStack`.
- The ACM validation CNAME exists in the DNS account, and the certificate is issued.
- The alias A record for the domain (step 2 above) exists, and the site is public at `https://fair.dataobservatory.net`. The `DistributionDomainName` host itself shows a certificate warning, because the certificate covers only the custom domain.
- Resolvers that looked up the name before the record existed can cache the "not found" answer for up to 15 minutes (the zone SOA negative TTL). A device that still cannot resolve the name shortly after a first publication needs a DNS cache flush or a short wait.
- Published pages come from `../build`. To publish a new version, run `npm run build` at the repository root and `npx cdk deploy` again; the deployment invalidates the HTML cache.

## Credentials with SSO profiles

The CDK CLI used here could not resolve credentials from an AWS SSO profile on its own (errors "Unable to resolve AWS account" or "no credentials have been configured"). Export temporary credentials into the shell instead, without writing them to any file:

```sh
eval "$(aws configure export-credentials --profile <app-profile> --format env)"
export AWS_REGION=us-east-1 CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
npx cdk diff
npx cdk deploy
```
