import { z } from 'zod';

export const runtimeErrorCodeSchema = z.enum([
  'action_already_used',
  'attack_target_downed',
  'attack_target_out_of_reach',
  'bonus_action_already_used',
  'character_not_found',
  'character_library_entry_not_found',
  'character_not_placed',
  'command_id_conflict',
  'duplicate_join',
  'email_already_registered',
  'encounter_already_active',
  'internal_server_error',
  'invalid_credentials',
  'invalid_attack_target',
  'invalid_character_id',
  'invalid_character_hp',
  'invalid_character_library_entry',
  'invalid_condition_list',
  'invalid_command',
  'invalid_character_state',
  'invalid_encounter_participant',
  'invalid_encounter_session_association',
  'invalid_entity_position',
  'invalid_grid_size',
  // A GM tried to move a player intent to a status the protocol does not allow
  // from where it currently is - including back to `pending`, which would let a
  // resubmission overwrite a decision the GM already made.
  'invalid_intent_status_transition',
  'invalid_movement_usage_amount',
  'invalid_participant_session_association',
  // A participant tried to answer a resolution request addressed to a different
  // seat. Distinct from `invalid_role_assumption`: the role may be correct and
  // the seat still wrong.
  'invalid_resolution_target',
  'invalid_role_assumption',
  'player_intent_not_found',
  // The seat exists but belongs to a different authenticated account.
  'seat_owned_by_another_account',
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
  // The request exists but has already been answered or cancelled. Re-rolling it
  // under a fresh command ID is the attack this refuses.
  'resolution_request_already_resolved',
  'resolution_request_not_found',
  'rules_profile_not_found',
  'scene_entity_out_of_bounds',
  'scene_entity_overlap',
  'scene_not_found',
  'scene_terrain_blocks_occupant',
  'scene_terrain_out_of_bounds',
  'self_target_not_allowed',
  'session_not_found',
  'too_many_requests',
  'turn_actor_downed',
  'unauthenticated',
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
