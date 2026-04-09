import json
import os
import boto3
import time
from botocore.exceptions import ClientError
from aws_lambda_powertools.utilities.typing import LambdaContext
from common_utils import (
    logger, tracer, metrics, 
    create_response, handle_options_request, 
    handle_client_error, handle_general_exception
)

# Initialize AWS clients
bedrock_agent = boto3.client('bedrock-agent')

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics
def handler(event, context: LambdaContext):
    """
    Lambda handler to sync a knowledge base by starting an ingestion job
    after the knowledge base deployment is complete.
    
    Args:
        event: The Lambda event object
        context: The Lambda context object
        
    Returns:
        dict: Response indicating success or failure
    """
    try:
        # Extract knowledge base ID and data source ID from environment variables
        knowledge_base_id = os.environ.get('KNOWLEDGE_BASE_ID')
        data_source_id = os.environ.get('DATA_SOURCE_ID')
        
        if not knowledge_base_id or not data_source_id:
            error_msg = "Missing required environment variables: KNOWLEDGE_BASE_ID or DATA_SOURCE_ID"
            logger.error(error_msg)
            metrics.add_metric(name="MissingEnvironmentVariables", unit="Count", value=1)
            return {
                'statusCode': 400,
                'body': json.dumps({'error': error_msg})
            }
        
        # Start the ingestion job
        logger.info(f"Starting ingestion job for knowledge base {knowledge_base_id} with data source {data_source_id}")
        response = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=knowledge_base_id,
            dataSourceId=data_source_id,
            description='Ingestion job triggered by CDK deployment'
        )
        
        # Extract job ID from the nested structure
        job_id = response['ingestionJob']['ingestionJobId']
        logger.info(f"Started ingestion job: {job_id}")
        metrics.add_metric(name="IngestionJobStarted", unit="Count", value=1)
        
        # Wait for job to complete (with timeout)
        max_wait_time = 300  # 5 minutes
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            job_status = bedrock_agent.get_ingestion_job(
                knowledgeBaseId=knowledge_base_id,
                dataSourceId=data_source_id,
                ingestionJobId=job_id
            )
            
            status = job_status['ingestionJob']['status']
            logger.info(f"Job status: {status}")
            
            if status == 'COMPLETE':
                logger.info(f"Knowledge base ingestion completed successfully")
                metrics.add_metric(name="IngestionJobCompleted", unit="Count", value=1)
                return {
                    'statusCode': 200,
                    'body': json.dumps({'message': 'Knowledge base ingestion completed successfully'})
                }
            elif status in ['FAILED', 'STOPPED']:
                error_msg = f"Knowledge base ingestion failed with status: {status}"
                logger.error(error_msg)
                metrics.add_metric(name="IngestionJobFailed", unit="Count", value=1)
                return {
                    'statusCode': 500,
                    'body': json.dumps({'error': error_msg})
                }
            # nosemgrep: arbitrary-sleep
            time.sleep(10)
        
        # If we reach here, we timed out waiting
        logger.warning("Knowledge base ingestion started but did not complete within timeout")
        metrics.add_metric(name="IngestionJobTimeout", unit="Count", value=1)
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Knowledge base ingestion started but did not complete within timeout'})
        }
            
    except ClientError as e:
        logger.error(f"AWS Client Error: {str(e)}")
        metrics.add_metric(name="IngestionJobClientError", unit="Count", value=1)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f"AWS Error: {str(e)}"})
        }
    except Exception as e:
        logger.exception(f"Error processing request: {str(e)}")
        metrics.add_metric(name="IngestionJobGeneralError", unit="Count", value=1)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f"Internal server error: {str(e)}"})
        }
