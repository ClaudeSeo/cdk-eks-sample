#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { EksExampleStack } from '../lib/eks-example-stack';

const app = new cdk.App();
new EksExampleStack(app, 'EksExampleStack');