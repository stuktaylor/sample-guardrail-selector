import json
import os
import boto3
from botocore.exceptions import ClientError
from aws_lambda_powertools.utilities.typing import LambdaContext
from common_utils import (
    logger, tracer, metrics, 
    create_response, handle_options_request, 
    handle_client_error, handle_general_exception
)

# Initialize AWS clients
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics
def handler(event, context: LambdaContext):
    try:
        # Check if this is a preflight OPTIONS request
        options_response = handle_options_request(event)
        if options_response:
            return options_response
        
        # Get the path and method to determine the operation
        path = event.get('path', '')
        http_method = event.get('httpMethod', '')
        
        # Handle different API endpoints
        if path.endswith('/knowledge-base/query') and http_method == 'POST':
            return handle_query(event)
        else:
            logger.warning(f"Unsupported path or method: {path}, {http_method}")
            return create_response(event, 400, {'error': 'Unsupported operation'})
            
    except boto3.exceptions.botocore.exceptions.ClientError as e:
        return handle_client_error(event, e)
    except Exception as e:
        return handle_general_exception(event, e)

@tracer.capture_method
def perform_retrieve_and_generate(retrieve_params):
    """
    Perform the retrieve_and_generate call with error handling for invalid session IDs.
    
    Args:
        retrieve_params (dict): Parameters for the retrieve_and_generate API call
        
    Returns:
        tuple: (response, bool) - The API response and a flag indicating if session ID was changed
    """
    try:
        # First attempt with the provided session ID (if any)
        logger.info("Attempting retrieve_and_generate with provided parameters")
        response = bedrock_agent_runtime.retrieve_and_generate(**retrieve_params)
        return response, False  # No session ID change
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', '')
        
        # Check if this is an invalid session ID error
        if (error_code == 'ValidationException' and 
            'is not valid' in error_message and 
            'Session with Id' in error_message):
            
            logger.warning(f"Invalid session ID error: {error_message}. Retrying without session ID.")
            
            # Remove the session ID and try again
            if 'sessionId' in retrieve_params:
                old_session_id = retrieve_params.pop('sessionId')
                logger.info(f"Removed invalid session ID: {old_session_id}")
                
                # Retry without the session ID
                response = bedrock_agent_runtime.retrieve_and_generate(**retrieve_params)
                return response, True  # Session ID was changed
            else:
                # This shouldn't happen, but just in case
                logger.warning("Invalid session ID error but no sessionId in parameters")
                raise
        else:
            # For other errors, just re-raise
            logger.warning(f"Error in retrieve_and_generate: {error_code} - {error_message}")
            raise

@tracer.capture_method
def handle_query(event):
    """
    Handle POST /knowledge-base/query endpoint
    """
    # Parse the request body
    body = json.loads(event.get('body', '{}'))
    
    # Get the query text from the request
    query = body.get('query')
    if not query:
        logger.warning("Missing query text in request")
        metrics.add_metric(name="MissingQueryError", unit="Count", value=1)
        return create_response(event, 400, {'error': 'Query text is required'})
    
    # Get the session ID from the request (if provided)
    session_id = body.get('sessionId')
    
    limit = 5
    
    # Get the knowledge base ID from environment variables
    knowledge_base_id = os.environ.get('KNOWLEDGE_BASE_ID')
    if not knowledge_base_id:
        logger.error("Knowledge base ID not configured")
        metrics.add_metric(name="MissingKnowledgeBaseId", unit="Count", value=1)
        return create_response(event, 500, {'error': 'Knowledge base ID not configured'})
    
    # Get the guardrail ID from the query
    guardrail_id = body.get('guardrailId')
    guardrail_version = 'DRAFT'
    
    if not guardrail_id:
        logger.warning("Guardrail ID not configured, proceeding without guardrail")
    else:
        logger.info(f"Using guardrail ID: {guardrail_id} with version: {guardrail_version}")
    
    logger.info(f"Processing knowledge base query: '{query}' with session ID: {session_id or 'None'}")

    # Create base parameters for the API call
    retrieve_params = {
        'input': {
            'text': query
        },
        'retrieveAndGenerateConfiguration': {
            'type': 'KNOWLEDGE_BASE',
            'knowledgeBaseConfiguration': {
                'knowledgeBaseId': knowledge_base_id,
                'modelArn': 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0',
                'retrievalConfiguration': {
                    'vectorSearchConfiguration': {
                        'numberOfResults': limit,
                        'overrideSearchType': 'HYBRID'  # Enable hybrid search (semantic & text)
                    }
                }
            }
        }
    }
    
    # Add session ID if provided
    if session_id:
        retrieve_params['sessionId'] = session_id
        logger.info(f"Using existing session ID: {session_id}")
    
    # Add guardrail configuration if guardrail_id is available
    if guardrail_id:
        retrieve_params['retrieveAndGenerateConfiguration']['knowledgeBaseConfiguration']['generationConfiguration'] = {
            'guardrailConfiguration': {  # Note: guardrailConfiguration is nested under generationConfiguration
                'guardrailId': guardrail_id,
                'guardrailVersion': guardrail_version
            }
        }

    # Optionally, you might want to add inference configuration
    retrieve_params['retrieveAndGenerateConfiguration']['knowledgeBaseConfiguration']['generationConfiguration'] = {
        **retrieve_params['retrieveAndGenerateConfiguration']['knowledgeBaseConfiguration'].get('generationConfiguration', {}),
        'inferenceConfig': {
            'textInferenceConfig': {
                'maxTokens': 1024,  # Adjust as needed
                'temperature': 0.7,  # Adjust as needed
                'topP': 0.9  # Adjust as needed
            }
        },
        'performanceConfig': {
            'latency': 'standard'
        }
    }

    # Query the knowledge base using retrieve_and_generate with error handling
    logger.info(f"Querying knowledge base: {knowledge_base_id}")
    tracer.put_annotation(key="operation", value="retrieve_and_generate")
    
    try:
        response, session_changed = perform_retrieve_and_generate(retrieve_params)
        
        # Extract the session ID from the response
        response_session_id = response.get('sessionId')
        if response_session_id:
            logger.info(f"Got session ID from response: {response_session_id}")
        else:
            logger.warning("No session ID in response")
    except Exception as e:
        logger.warning(f"Error querying knowledge base: {str(e)}")
        metrics.add_metric(name="KnowledgeBaseQueryError", unit="Count", value=1)
        return create_response(event, 500, {'error': f"Error querying knowledge base: {str(e)}"})
    
    logger.info("Knowledge base query successful")
    metrics.add_metric(name="SuccessfulQuery", unit="Count", value=1)

    return create_response(event, 200, {
        'query': query,
        'results': response,
        'sessionId': response.get('sessionId')
    })
