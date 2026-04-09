import json
import os
import boto3
from botocore.exceptions import ClientError
from aws_lambda_powertools.utilities.typing import LambdaContext
from common_utils import (
    logger, tracer, metrics, 
    create_response, handle_options_request, 
    DecimalEncoder,
    handle_client_error, handle_general_exception
)

# Initialize AWS clients
bedrock_runtime = boto3.client('bedrock-runtime')

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
        if path.endswith('/llm/query') and http_method == 'POST':
            return handle_query(event)
        else:
            logger.warning(f"Unsupported path or method: {path}, {http_method}")
            return create_response(event, 400, {'error': 'Unsupported operation'})
            
    except boto3.exceptions.botocore.exceptions.ClientError as e:
        return handle_client_error(event, e)
    except Exception as e:
        return handle_general_exception(event, e)

@tracer.capture_method
def handle_query(event):
    """
    Handle POST /llm/query endpoint
    """
    # Parse the request body
    body = json.loads(event.get('body', '{}'))
    
    # Get the messages from the request
    messages = body.get('messages')
    if not messages:
        logger.warning("Missing messages in request")
        metrics.add_metric(name="MissingMessagesError", unit="Count", value=1)
        return create_response(event, 400, {'error': 'Messages are required'})
    
    # Get the query text for logging purposes (last user message)
    query = None
    for message in reversed(messages):
        if message.get('role') == 'user':
            content = message.get('content', [])
            if content and isinstance(content, list) and 'text' in content[0]:
                query = content[0]['text']
                break
    
    # Get the model Id from environment variables or use default
    model_id = body.get('modelId') or os.environ.get('MODEL_ID', 'amazon.nova-lite-v1:0')
    
    # Get the guardrail ID from the request (if provided)
    guardrail_id = body.get('guardrailId')
    guardrail_version = body.get('guardrailVersion', 'DRAFT')
    
    # Get the session ID from the request (if provided)
    session_id = body.get('sessionId')
    
    logger.info(f"Processing conversation with last query: '{query}' with model: {model_id}")
    logger.info(f"Session ID: {session_id or 'None'}, Guardrail ID: {guardrail_id or 'None'}")
    
    # Use the messages directly from the request
    model_request = {
        "messages": messages,
        "inferenceConfig": {
            "maxTokens": body.get('maxTokens', 1024),
            "temperature": body.get('temperature', 0.7)
        }
    }
    
    # Add stop sequences if provided
    if body.get('stopSequences'):
        model_request["stop"] = body.get('stopSequences')
    
    # Remove the invoke_request dictionary since we're using keyword arguments
    # Add guardrail configuration if guardrail_id is available
    guardrail_params = {}
    if guardrail_id:
        logger.info(f"Using guardrail ID: {guardrail_id} with version: {guardrail_version}")

    
    try:
        # Invoke the Bedrock model
        tracer.put_annotation(key="operation", value="invoke_model")
        tracer.put_annotation(key="model", value=model_id)
        
        # Call invoke_model with keyword arguments
        if guardrail_id:
            response = bedrock_runtime.invoke_model(
                modelId=model_id,
                body=json.dumps(model_request),
                contentType='application/json',
                accept='application/json',
                guardrailIdentifier=guardrail_id,
                guardrailVersion=guardrail_version
            )
        else:
            response = bedrock_runtime.invoke_model(
                modelId=model_id,
                body=json.dumps(model_request),
                contentType='application/json',
                accept='application/json'
            )
        # Parse the response
        response_body = json.loads(response['body'].read().decode('utf-8'))
        
        logger.info("Model invocation successful")
        metrics.add_metric(name="SuccessfulQuery", unit="Count", value=1)
        
        generated_text = ""
        # Extract the generated text from the response
        # Handle the structure where message is inside output
        if response_body and 'output' in response_body and 'message' in response_body['output']:
            message_content = response_body['output']['message'].get('content', [])
            if message_content and isinstance(message_content, list):
                # Extract text from each content item
                text_parts = []
                for content_item in message_content:
                    if isinstance(content_item, dict) and 'text' in content_item:
                        text_parts.append(content_item['text'])
                generated_text = '\n'.join(text_parts)
            else:
                generated_text = str(message_content)
        
        # Check if there was a guardrail intervention
        guardrail_action = None
        if 'amazon-bedrock-guardrailAction' in response_body:
            guardrail_action = response_body['amazon-bedrock-guardrailAction']
            logger.info(f"Guardrail action: {guardrail_action}")
            metrics.add_metric(name="GuardrailIntervention", unit="Count", value=1)
        
        # log all the response info
        logger.info(f"Response: {json.dumps(response_body, cls=DecimalEncoder)}")
        logger.info(f"Guardrail action: {guardrail_action}")
        logger.info(f"Session ID: {session_id or 'None'}, Guardrail ID: {guardrail_id or 'None'}")
        
        return create_response(event, 200, {
            'query': query,
            'results': {
                'citations': [],
                'output': {
                    'text': generated_text
                },
                'sessionId': session_id
            },
            'sessionId': session_id
        })
        
    except ClientError as e:
        logger.error(f"Error invoking Bedrock model: {str(e)}")
        metrics.add_metric(name="ModelInvocationError", unit="Count", value=1)
        return create_response(event, 500, {'error': f"Error invoking Bedrock model: {str(e)}"})
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        metrics.add_metric(name="UnexpectedError", unit="Count", value=1)
        return create_response(event, 500, {'error': f"Unexpected error: {str(e)}"})
