#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FairSiteStack } from '../lib/fair-site-stack';

const app = new cdk.App();

const domainName: string = app.node.tryGetContext('domainName') ?? 'fair.dataobservatory.net';

new FairSiteStack(app, 'FairSiteStack', {
	domainName,
	// The account comes from the environment (never a literal). CloudFront-attached ACM
	// certificates must live in us-east-1, so the region is fixed.
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: 'us-east-1'
	},
	description: 'FAIR Resources Finder static site (S3 + CloudFront)'
});
