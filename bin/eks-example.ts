#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { EksClusterStack } from '../lib/eks-cluster-stack';

const app = new cdk.App();

new EksClusterStack(app, 'EksClusterStack', {
    clusterName: 'eks-cluster-test',
});
