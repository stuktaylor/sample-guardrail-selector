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
bedrock = boto3.client('bedrock')
bedrock_agent = boto3.client('bedrock-agent')
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
        
        if http_method == 'GET':
            # Check if projectId is provided for single item retrieval
            path_parameters = event.get('pathParameters', {})
            if path_parameters and path_parameters.get('agentId'):
                return get_agent_guardrail(event, event['pathParameters']['agentId'])
            return list_guardrails(event)
        elif path == '/guardrails' and http_method == 'PUT':
            return update_agent_guardrail(event)
        else:
            logger.warning(f"Unsupported path or method: {path}, {http_method}")
            return create_response(event, 400, {'error': 'Unsupported operation'})
            
    except boto3.exceptions.botocore.exceptions.ClientError as e:
        return handle_client_error(event, e)
    except Exception as e:
        return handle_general_exception(event, e)

@tracer.capture_method
def list_guardrails(event):
    """
    Handle GET /guardrails endpoint to list all guardrails
    """
    logger.info("Listing all guardrails")
    
    try:
        # First, list all guardrails (without guardrailIdentifier to get the DRAFT versions)
        response = bedrock.list_guardrails()
        guardrails = response.get('guardrails', [])
        
        # Get detailed information for each guardrail including all versions
        detailed_guardrails = []
        for guardrail in guardrails:
            guardrail_id = guardrail.get('id')
            
            # Get the DRAFT version details
            try:
                draft_detail = bedrock.get_guardrail(
                    guardrailIdentifier=guardrail_id
                )
                
                # Now list all versions of this guardrail
                all_versions_response = bedrock.list_guardrails(
                    guardrailIdentifier=guardrail_id
                )
                all_versions = all_versions_response.get('guardrails', [])
                
                # Get detailed information for each version
                version_details = []
                for version_info in all_versions:
                    version = version_info.get('version')
                    if version != 'DRAFT':  # We already have the DRAFT version
                        try:
                            version_detail = bedrock.get_guardrail(
                                guardrailIdentifier=guardrail_id,
                                guardrailVersion=version
                            )
                            version_details.append(version_detail)
                        except ClientError as e:
                            logger.warning(f"Error getting details for guardrail {guardrail_id} version {version}: {str(e)}")
                            # Include basic version info without details
                            version_details.append(version_info)
                
                # Combine DRAFT with other versions
                all_versions_details = [draft_detail] + version_details
                
                # Add the guardrail with all its versions
                detailed_guardrails.append({
                    'guardrailId': guardrail_id,
                    'name': guardrail.get('name'),
                    'versions': all_versions_details
                })
                
            except ClientError as e:
                logger.warning(f"Error getting details for guardrail {guardrail_id}: {str(e)}")
                # Include basic info without details
                detailed_guardrails.append(guardrail)
        
        logger.info(f"Successfully retrieved {len(detailed_guardrails)} guardrails with all versions")
        metrics.add_metric(name="SuccessfulGuardrailsList", unit="Count", value=1)
        
        return create_response(event, 200, {
            'guardrails': detailed_guardrails
        })
        
    except ClientError as e:
        logger.error(f"Error listing guardrails: {str(e)}")
        metrics.add_metric(name="GuardrailsListError", unit="Count", value=1)
        return handle_client_error(event, e, "GuardrailsListError")

@tracer.capture_method
def get_agent_guardrail(event, agent_id):
    """
    Get the guardrail associated with a specific agent
    """
    try:
        # Get the agent details
        agent_response = bedrock_agent.get_agent(
            agentId=agent_id
        )
        
        # Check if the agent has a guardrail configuration
        guardrail_config = agent_response.get('agent').get('guardrailConfiguration', {})
        
        # Check specifically for guardrailIdentifier, as that's the key field
        guardrail_id = guardrail_config.get('guardrailIdentifier')
        
        if not guardrail_id:
            logger.info(f"Agent {agent_id} does not have a guardrail configured (no guardrailIdentifier found)")
            return create_response(event, 200, {
                'agentId': agent_id,
                'guardrail': None
            })
        
        guardrail_version = guardrail_config.get('guardrailVersion', 'DRAFT')
        
        # Get detailed information about the guardrail
        try:
            guardrail_response = bedrock.get_guardrail(
                guardrailIdentifier=guardrail_id,
                guardrailVersion=guardrail_version
            )
            
            logger.info(f"Successfully retrieved guardrail {guardrail_id} for agent {agent_id}")
            metrics.add_metric(name="SuccessfulAgentGuardrailGet", unit="Count", value=1)
            
            return create_response(event, 200, {
                'agentId': agent_id,
                'guardrail': guardrail_response
            })
            
        except ClientError as e:
            logger.warning(f"Error getting details for guardrail {guardrail_id}: {str(e)}")
            
            # Return basic info if detailed info is not available
            return create_response(event, 200, {
                'agentId': agent_id,
                'guardrail': {
                    'id': guardrail_id,
                    'version': guardrail_version
                }
            })
            
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            logger.warning(f"Agent {agent_id} not found")
            return create_response(event, 404, {'error': f"Agent {agent_id} not found"})
        
        logger.error(f"Error getting agent {agent_id}: {str(e)}")
        metrics.add_metric(name="AgentGuardrailGetError", unit="Count", value=1)
        return handle_client_error(event, e, "AgentGuardrailGetError")

@tracer.capture_method
def prepare_updated_agent(agent_id):
    """
    Prepare the agent once its configuration has been updated.
    """

    try:
        prepare_response = bedrock_agent.prepare_agent(agentId=agent_id)
        logger.info(f"Agent Status {prepare_response['agentStatus']}")
    except ClientError as e:
        logger.error(f"Error preparing agent: {str(e)}")
        metrics.add_metric(name="PrepareAgentError", unit="Count", value=1)
        return handle_client_error(event, e, "PrepareAgentError")
    
@tracer.capture_method
def update_agent_guardrail(event):
    """
    Handle PUT /guardrails endpoint to update the agent's guardrail
    """
    # Parse the request body
    body = json.loads(event.get('body', '{}'))
    
    # Get the guardrail ID and version from the request
    guardrail_id = body.get('guardrailId')
    guardrail_version = body.get('guardrailVersion', 'DRAFT')
    agent_id = body.get('agentId')
    if agent_id is None:
        return create_response(event, 400, {'error': 'agentId is required'})
    
    try:
        # First, get the current agent configuration to ensure it exists and get required fields
        try:
            agent_response = bedrock_agent.get_agent(
                agentId=agent_id
            )
            agent_details = agent_response.get('agent', {})
            logger.info(f"Found agent {agent_id}")
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.warning(f"Agent {agent_id} not found")
                return create_response(event, 404, {'error': f"Agent {agent_id} not found"})
            raise
        
        # Extract required parameters from the existing agent configuration
        # These are needed for any update_agent call
        agent_name = agent_details.get('agentName')
        agent_resource_role_arn = agent_details.get('agentResourceRoleArn')
        foundation_model = agent_details.get('foundationModel')
        instruction = agent_details.get('instruction')  # Get the instruction field which is required
        
        # Prepare base update parameters with required fields
        update_params = {
            'agentId': agent_id,
            'agentName': agent_name,
            'agentResourceRoleArn': agent_resource_role_arn,
            'foundationModel': foundation_model,
            'instruction': instruction  # Include the instruction field
        }
        
        # If guardrail_id is None or empty, we're removing the guardrail
        if not guardrail_id:
            logger.info(f"Removing guardrail from agent {agent_id}")
            
            # When removing a guardrail, we need to exclude the guardrailConfiguration parameter
            # rather than setting it to None or empty
            
            # Check if the agent currently has a guardrail configuration
            if 'guardrailConfiguration' in agent_details:
                logger.info(f"Agent {agent_id} has an existing guardrail that will be removed")
            
        else:
            # If we're adding/updating a guardrail, verify it exists first
            try:
                guardrail_response = bedrock.get_guardrail(
                    guardrailIdentifier=guardrail_id,
                    guardrailVersion=guardrail_version
                )
                logger.info(f"Found guardrail {guardrail_id} with version {guardrail_version}")
                
                # Add guardrail configuration to the update parameters
                update_params['guardrailConfiguration'] = {
                    'guardrailIdentifier': guardrail_id,
                    'guardrailVersion': guardrail_version
                }
                
                logger.info(f"Setting guardrail {guardrail_id} with version {guardrail_version} for agent {agent_id}")
                
            except ClientError as e:
                if e.response['Error']['Code'] == 'ResourceNotFoundException':
                    logger.warning(f"Guardrail {guardrail_id} not found")
                    return create_response(event, 404, {'error': f"Guardrail {guardrail_id} not found"})
                raise
        
        # Update the agent with a single call, either with or without guardrailConfiguration
        update_response = bedrock_agent.update_agent(**update_params)
        
        if not guardrail_id:
            logger.info(f"Successfully removed guardrail from agent {agent_id}")
            metrics.add_metric(name="GuardrailRemovalSuccess", unit="Count", value=1)
            
            prepare_updated_agent(agent_id)

            return create_response(event, 200, {
                'message': 'Guardrail removed successfully',
                'agentId': agent_id,
                'currentGuardrail': None
            })
        else:
            logger.info(f"Successfully updated agent {agent_id} with guardrail {guardrail_id}")
            metrics.add_metric(name="GuardrailUpdateSuccess", unit="Count", value=1)
        
        logger.info(f"Successfully updated agent {agent_id} with guardrail {guardrail_id}")
        metrics.add_metric(name="GuardrailUpdateSuccess", unit="Count", value=1)

        prepare_updated_agent(agent_id)

        return create_response(event, 200, {
            'message': 'Guardrail updated successfully',
            'agentId': agent_id,
            'currentGuardrail': {
                'id': guardrail_id,
                'version': guardrail_version
            }
        })
        
    except ClientError as e:
        logger.error(f"Error updating guardrail: {str(e)}")
        metrics.add_metric(name="GuardrailUpdateError", unit="Count", value=1)
        return handle_client_error(event, e, "GuardrailUpdateError")