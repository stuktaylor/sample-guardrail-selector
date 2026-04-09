#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SampleGSStack } from '../lib/sample-gs-stack';
import { KnowledgeBaseTypes } from '../lib/sample-gs-stack-props';

const app = new cdk.App();

const enableLocalhost = app.node.tryGetContext('enableLocalhost') === 'true';
const prefix = app.node.tryGetContext('prefix') || 'samplegskb';
const stackName = app.node.tryGetContext('stackName') || 'SampleGS';
const knowledgeBaseTypeInput = app.node.tryGetContext('knowledgeBaseType') || KnowledgeBaseTypes.OPENSEARCH;

// Validate the knowledge base type
const knowledgeBaseType = 
  knowledgeBaseTypeInput === KnowledgeBaseTypes.AURORA_POSTGRES ? 
  KnowledgeBaseTypes.AURORA_POSTGRES : 
  KnowledgeBaseTypes.OPENSEARCH;

new SampleGSStack(app, 'SampleGSStack', {
  enableLocalhost: enableLocalhost,
  prefix: prefix,
  stackName: stackName,
  knowledgeBaseType: knowledgeBaseType,
  description: 'AWS Sample Code (uksb-tgh36jjfek)'
});
