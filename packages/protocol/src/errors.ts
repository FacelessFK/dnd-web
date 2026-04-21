import { z } from 'zod';

export const runtimeErrorCodeSchema = z.enum([
  'action_already_used',
  'attack_target_downed',
  'attack_target_out_of_reach',
  'bonus_action_already_used',
  'character_not_found',
  'character_not_placed',
  'command_id_conflict',
  'duplicate_join',
  'encounter_already_active',
  'internal_server_error',
  'invalid_attack_target',
  'invalid_character_id',
  'invalid_command',
  'invalid_character_state',
  'invalid_encounter_participant',
  'invalid_encounter_session_association',
  'invalid_entity_position',
  'invalid_grid_size',
  'invalid_movement_usage_amount',
  'invalid_participant_session_association',
  'invalid_role_assumption',
  'invalid_scene_id',
  'invalid_scene_encounter_association',
  'invalid_scene_session_association',
  'invalid_session_id',
  'invalid_turn_actor',
  'invalid_turn_advance',
  'movement_destination_blocked',
  'movement_exceeds_allowance',
  'movement_usage_exceeds_allowance',
  'movement_out_of_bounds',
  'no_active_encounter',
  'no_active_scene',
  'no_assigned_character',
  'participant_not_found',
  'reaction_already_used',
  'rules_profile_not_found',
  'scene_entity_out_of_bounds',
  'scene_entity_overlap',
  'scene_not_found',
  'self_target_not_allowed',
  'session_not_found',
  'turn_actor_downed',
]);

export const sessionErrorCodeSchema = runtimeErrorCodeSchema;

export const runtimeErrorSchema = z.object({
  code: runtimeErrorCodeSchema,
  message: z.string().min(1),
});

export const commandErrorSchema = z.object({
  ok: z.literal(false),
  error: runtimeErrorSchema,
});

export type RuntimeErrorCode = z.infer<typeof runtimeErrorCodeSchema>;
export type SessionErrorCode = RuntimeErrorCode;
