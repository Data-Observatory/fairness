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
- A response headers policy: HSTS (one year, includeSubdomains, no preload), nosniff, frame deny, referrer policy `strict-origin-when-cross-origin`, a Content-Security-Policy limited to same-origin sources plus the Google tag hosts (googletagmanager.com, google-analytics.com, analytics.google.com), and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- Two `BucketDeployment`s of `../build` (see Caching).
- Optional access logging, off by default (see Access logging).

Outputs: `DistributionDomainName`, `DistributionId`, `BucketName`, `CertificateArn`, `SiteUrl`.

## Caching

The build is uploaded by two `BucketDeployment`s with the same `../build` source. Include and exclude filters make each file belong to exactly one of them.

| Deployment              | Files                                                                    | Cache-Control                         | Prune | Invalidation |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------- | ----- | ------------ |
| `DeployImmutableAssets` | `_app/immutable/**` (content-hashed names)                               | `public, max-age=31536000, immutable` | no    | none         |
| `DeploySite`            | everything else (html, `__data.json`, favicon, `robots.txt`, `404.html`) | `public, max-age=0, must-revalidate`  | yes   | `/*`         |

Prune is off for the immutable deployment on purpose: a page cached by a browser or by CloudFront can still import a chunk from a previous build, so old chunks must stay in the bucket after a new deploy. The second deployment excludes `_app/immutable/*`, so its prune never deletes them. It also depends on the first, so new chunks are uploaded before the pages that reference them. Invalidation is only needed for the files whose names do not change, so only the second deployment invalidates.

Old chunks accumulate. Remove them manually (or with an S3 lifecycle rule) if storage grows.

## Access logging

Off by default: without the context the synthesized template is unchanged. Turn it on with a CDK context value:

```sh
npx cdk synth -c domainName=fair.example.test -c accessLogs=true -c accessLogRetentionDays=90
```

| Context                  | Default | Effect                                                    |
| ------------------------ | ------- | --------------------------------------------------------- |
| `accessLogs`             | `false` | `true` creates the log bucket and enables both log kinds. |
| `accessLogRetentionDays` | `90`    | Days after which log objects expire. Positive integer.    |

When on, the stack adds one log bucket (all public access blocked, TLS enforced, S3-managed encryption, object ownership `ObjectWriter` because CloudFront standard logging delivers through bucket ACLs, retained on stack deletion, lifecycle expiration after `accessLogRetentionDays`). CloudFront standard logs go to the prefix `cloudfront/` and S3 server access logs of the site bucket to the prefix `s3/`.

The logs contain visitor IP addresses. If logging is enabled, the privacy statement must say so, with the retention period.

Turning logging off again in a later deploy removes the logging settings from the distribution and the site bucket; the log bucket is retained with its contents until it is emptied and deleted by hand. Every deploy, including the one from the workflow below, takes the logging setting from its context values, so the same values must be passed each time.

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

## Deploy workflow: owner setup

`.github/workflows/deploy.yml` runs the checks, builds the site, and runs `cdk diff` and `cdk deploy` through GitHub OIDC, in two jobs. It is inert until the owner completes the steps below: both jobs run only when the repository variable `DEPLOY_ENABLED` is `true`. It starts after a successful `CI` run on `main` (for the commit that passed, `workflow_run`) or by hand (`workflow_dispatch`, default ref), never on `push`. Runs do not overlap and a run in progress is not cancelled. No account id, ARN or profile name is stored in the repository.

- Job `diff` (environment `production-diff`, no reviewers): runs `check`, `lint`, `validate`, the unit tests, `build`, `check:base-path` and the infra type-check and tests, then `cdk diff`. The diff is written to the job summary and the build is uploaded as the artifact `site-build`.
- Job `deploy` (environment `production`, `needs: diff`): pauses until a reviewer approves, so the approver reads the diff first, then downloads `site-build` and runs `cdk deploy`. The reviewed build is the build that is published.
- The infra packages are installed before the AWS credentials exist, so install scripts never see them.

Owner steps, none of which is done by the workflow or by an agent:

1. In the app account, create the GitHub OIDC identity provider (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`) if it does not exist.
2. In the app account, create an IAM role for the workflow. Its trust policy allows `sts:AssumeRoleWithWebIdentity` from that provider only when the `sub` claim equals one of `repo:Data-Observatory/fairness:environment:production` (job `deploy`) and `repo:Data-Observatory/fairness:environment:production-diff` (job `diff`), and `aud` equals `sts.amazonaws.com`. Both jobs use the same role (secret `AWS_DEPLOY_ROLE_ARN`); a separate role with read-only permissions for `production-diff` is an option. Its permissions allow it to assume only the CDK bootstrap roles of the account and region (the deploy, file-publishing, image-publishing and lookup roles created by `cdk bootstrap`) and nothing else.
3. In the GitHub repository settings, create the environment `production-diff` (no reviewers) and the environment `production` with required reviewers. The `deploy` job pauses at `production` until a reviewer approves, after the `diff` job has finished, which gates the `cdk deploy` step.
4. Add the repository variables `DEPLOY_ENABLED` (`true` to activate), `AWS_REGION` (`us-east-1`), `SITE_DOMAIN` (`fair.dataobservatory.net`), and optionally `ACCESS_LOGS` (`true` or empty) and `ACCESS_LOG_RETENTION_DAYS` (a number, or empty for 90).
5. Add the repository secret `AWS_DEPLOY_ROLE_ARN` with the ARN of the role from step 2.
6. If `ACCESS_LOGS` is `true`, update the privacy statement first: the logs contain visitor IP addresses.

The DNS records in the separate DNS account stay manual (see Account topology). A first deploy of a new domain waits at the certificate until the validation CNAME exists, so it is not suited to the workflow.

Third-party actions in the workflow are pinned by commit SHA, checked against each action's repository when the file was written: `actions/checkout` v4.3.1, `actions/setup-node` v4.4.0, `actions/upload-artifact` v4.6.2, `actions/download-artifact` v4.3.0, `aws-actions/configure-aws-credentials` v6.3.0. Update the SHAs deliberately.

## Current deployment state

- The stack `FairSiteStack` is deployed (us-east-1, the app account). Outputs are available with `aws cloudformation describe-stacks --stack-name FairSiteStack`.
- The ACM validation CNAME exists in the DNS account, and the certificate is issued.
- The alias A record for the domain (step 2 above) exists, and the site is public at `https://fair.dataobservatory.net`. The `DistributionDomainName` host itself shows a certificate warning, because the certificate covers only the custom domain.
- Resolvers that looked up the name before the record existed can cache the "not found" answer for up to 15 minutes (the zone SOA negative TTL). A device that still cannot resolve the name shortly after a first publication needs a DNS cache flush or a short wait.
- The stack was redeployed on 2026-11-02 with the CSP update for the Google tag (Google hosts added to `script-src`, `img-src` and `connect-src`). The consent version of the site (consent banner, tag loaded only after Accept, host-scoped tag cookies) is not deployed yet: the live site runs the interim commit with the tag and no banner until the next deploy.
- The deploy workflow exists and is inert (`DEPLOY_ENABLED` is not set); deploys remain manual.
- Published pages come from `../build`. To publish a new version, run `npm run build` at the repository root and `npx cdk deploy` again; the deployment invalidates the HTML cache.

## Credentials with SSO profiles

The CDK CLI used here could not resolve credentials from an AWS SSO profile on its own (errors "Unable to resolve AWS account" or "no credentials have been configured"). Export temporary credentials into the shell instead, without writing them to any file:

```sh
eval "$(aws configure export-credentials --profile <app-profile> --format env)"
export AWS_REGION=us-east-1 CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
npx cdk diff
npx cdk deploy
```
