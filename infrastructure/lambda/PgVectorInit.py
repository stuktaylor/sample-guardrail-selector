import json
import boto3
import os
import time
import traceback
from common_utils import (
    logger, tracer, metrics
)

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics
def handler(event, context):
    # Extract properties from the event
    props = event.get('ResourceProperties', {})
    
    # Initialize response
    response_data = {}
    
    try:
        # No need to check for CloudFormation requests with AwsCustomResource
        
        if event.get('RequestType') == 'Create' or event.get('RequestType') == 'Update':
            # Get the secret ARN from environment variables
            secret_arn = os.environ['SECRET_ARN']
            database_name = os.environ['DATABASE_NAME']
            cluster_arn = os.environ['CLUSTER_ARN']
            bedrock_user_secret_arn = os.environ['BEDROCK_USER_SECRET_ARN']
            
            logger.info(f"Initializing vector for database {database_name}")
            metrics.add_metric(name="VectorInitAttempt", unit="Count", value=1)
            
            # Initialize RDS Data API client and Secrets Manager client
            rds_client = boto3.client('rds-data')
            secrets_client = boto3.client('secretsmanager')
            
            # Get the bedrock user password from Secrets Manager
            bedrock_user_secret = secrets_client.get_secret_value(SecretId=bedrock_user_secret_arn)
            bedrock_user_secret_json = json.loads(bedrock_user_secret['SecretString'])
            bedrock_user_password = bedrock_user_secret_json['password']
            
            # Wait for the cluster to be available

            # nosemgrep: arbitrary-sleep
            time.sleep(10)
            
            # Create pgvector extension
            logger.info("Creating vector extension")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='CREATE EXTENSION IF NOT EXISTS vector;'
            )
            
            # Check pgvector version (must be 0.5.0 or higher)
            logger.info("Checking pgvector version")
            version_response = rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql="SELECT extversion FROM pg_extension WHERE extname='vector';"
            )
            
            pgvector_version = version_response['records'][0][0]['stringValue']
            logger.info(f"pgvector version: {pgvector_version}")
            
            # Create bedrock_integration schema
            logger.info("Creating bedrock_integration schema")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='CREATE SCHEMA IF NOT EXISTS bedrock_integration;'
            )
            
            # Create bedrock_user role with appropriate permissions
            logger.info("Creating bedrock_user role")
            try:
                rds_client.execute_statement(
                    resourceArn=cluster_arn,
                    secretArn=secret_arn,
                    database=database_name,
                    sql=f"CREATE ROLE bedrock_user WITH PASSWORD '{bedrock_user_password}' LOGIN;"
                )
            except Exception as e:
                # Role might already exist, which is fine
                logger.info(f"Note: {str(e)}")
                
                # Update the password for the existing role
                try:
                    rds_client.execute_statement(
                        resourceArn=cluster_arn,
                        secretArn=secret_arn,
                        database=database_name,
                        sql=f"ALTER ROLE bedrock_user WITH PASSWORD '{bedrock_user_password}';"
                    )
                    logger.info("Updated password for existing bedrock_user role")
                except Exception as e2:
                    logger.error(f"Error updating password: {str(e2)}")
            
            # Grant permissions to bedrock_user
            logger.info("Granting permissions to bedrock_user")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='GRANT ALL ON SCHEMA bedrock_integration TO bedrock_user;'
            )
            
            # Create vector table for Bedrock Knowledge Base
            logger.info("Creating bedrock_kb table in bedrock_integration schema")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='''
                CREATE TABLE IF NOT EXISTS bedrock_integration.bedrock_kb (
                    id UUID PRIMARY KEY,
                    embedding vector(1024),
                    chunks TEXT,
                    metadata JSON,
                    custom_metadata JSONB
                );
                '''
            )
            
            # Grant permissions on the table to bedrock_user
            logger.info("Granting permissions on bedrock_kb table to bedrock_user")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='GRANT ALL ON TABLE bedrock_integration.bedrock_kb TO bedrock_user;'
            )
            
            # Create HNSW index on the vector column for similarity search with recommended settings
            logger.info("Creating vector index with HNSW")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='CREATE INDEX IF NOT EXISTS vector_cosine_idx ON bedrock_integration.bedrock_kb USING hnsw (embedding vector_cosine_ops) WITH (ef_construction=256);'
            )
            
            # Create text search index
            logger.info("Creating text search index")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='CREATE INDEX IF NOT EXISTS chunks_idx ON bedrock_integration.bedrock_kb USING gin (to_tsvector(\'simple\', chunks));'
            )
            
            # Create metadata index
            logger.info("Creating metadata index")
            rds_client.execute_statement(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                database=database_name,
                sql='CREATE INDEX IF NOT EXISTS metadata_idx ON bedrock_integration.bedrock_kb USING gin (custom_metadata);'
            )
            
            response_data = {'Message': 'Vector extension, schema, tables, and indexes created successfully'}
            metrics.add_metric(name="VectorInitSuccess", unit="Count", value=1)
            
            # No need to handle CloudFormation responses with AwsCustomResource
            return {
                'statusCode': 200,
                'body': json.dumps(response_data)
            }
        
        elif event.get('RequestType') == 'Delete':
            # Nothing to do for deletion, the database will be deleted by CloudFormation
            logger.info("Delete request received - no action needed as database will be deleted by CloudFormation")
            return {
                'statusCode': 200,
                'body': json.dumps({'Message': 'Delete request acknowledged'})
            }
        
    except Exception as e:
        logger.error(f"Error initializing vector: {str(e)}")
        logger.error(traceback.format_exc())
        metrics.add_metric(name="VectorInitFailure", unit="Count", value=1)
        
        return {
            'statusCode': 500,
            'body': json.dumps({'Error': str(e)})
        }
