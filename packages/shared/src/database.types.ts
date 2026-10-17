
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "account_deletions": {
                  Row: {
                    "deleted_at": string,"id": string,"reason_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deleted_at"?: string,"id"?: string,"reason_code"?: string
                  }
                  Update: {
                    "deleted_at"?: string,"id"?: string,"reason_code"?: string
                  }
                  Relationships: [
                    
                  ]
                },"account_export_requests": {
                  Row: {
                    "id": string,"requested_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"requested_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"requested_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"activity_days": {
                  Row: {
                    "active_ms": number,"answers": number,"correct_first": number,"learning_path_id": string,"lessons": number,"local_day": string,"reviews": number,"updated_at": string,"user_id": string,"xp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active_ms"?: number,"answers"?: number,"correct_first"?: number,"learning_path_id": string,"lessons"?: number,"local_day": string,"reviews"?: number,"updated_at"?: string,"user_id": string,"xp"?: number
                  }
                  Update: {
                    "active_ms"?: number,"answers"?: number,"correct_first"?: number,"learning_path_id"?: string,"lessons"?: number,"local_day"?: string,"reviews"?: number,"updated_at"?: string,"user_id"?: string,"xp"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_days_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"actor_role": string | null,"created_at": string,"detail": NonNullable<Json>,"id": string,"target_id": string | null,"target_kind": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"actor_role"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string | null,"target_kind"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"actor_role"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string | null,"target_kind"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ai_cache": {
                  Row: {
                    "created_at": string,"expires_at": string,"hits": number,"key": string,"model": string,"payload": NonNullable<Json>,"prompt_version": string,"task": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"hits"?: number,"key": string,"model": string,"payload": NonNullable<Json>,"prompt_version": string,"task": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"hits"?: number,"key"?: string,"model"?: string,"payload"?: NonNullable<Json>,"prompt_version"?: string,"task"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_quota": {
                  Row: {
                    "count": number,"refunded": number,"updated_at": string,"used_on": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"refunded"?: number,"updated_at"?: string,"used_on": string,"user_id": string
                  }
                  Update: {
                    "count"?: number,"refunded"?: number,"updated_at"?: string,"used_on"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_reports": {
                  Row: {
                    "created_at": string,"id": string,"note": string | null,"prompt_version": string,"reason": string,"task": string,"usage_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"prompt_version": string,"reason": string,"task": string,"usage_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"prompt_version"?: string,"reason"?: string,"task"?: string,"usage_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_reports_usage_id_fkey"
      columns: ["usage_id"]
isOneToOne: true
      referencedRelation: "ai_usage"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "attempts": number,"cached": boolean,"created_at": string,"http_status": number | null,"id": string,"input_chars": number,"latency_ms": number,"model": string,"prompt_version": string,"repaired": boolean,"status": string,"task": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"cached"?: boolean,"created_at"?: string,"http_status"?: number | null,"id"?: string,"input_chars"?: number,"latency_ms"?: number,"model": string,"prompt_version": string,"repaired"?: boolean,"status": string,"task": string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"cached"?: boolean,"created_at"?: string,"http_status"?: number | null,"id"?: string,"input_chars"?: number,"latency_ms"?: number,"model"?: string,"prompt_version"?: string,"repaired"?: boolean,"status"?: string,"task"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"analytics_events": {
                  Row: {
                    "client_at": string | null,"created_at": string,"id": number,"name": string,"props": NonNullable<Json>,"route": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_at"?: string | null,"created_at"?: string,"id"?: never,"name": string,"props"?: NonNullable<Json>,"route"?: string | null,"user_id": string
                  }
                  Update: {
                    "client_at"?: string | null,"created_at"?: string,"id"?: never,"name"?: string,"props"?: NonNullable<Json>,"route"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"assessment_attempts": {
                  Row: {
                    "applied_at": string | null,"assessment_id": string,"completed_at": string | null,"current_item_id": string | null,"current_served_at": string | null,"id": string,"last_activity_at": string,"learning_path_id": string,"mode": string,"report": Json | null,"skipped": NonNullable<Json>,"started_at": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string | null,"assessment_id": string,"completed_at"?: string | null,"current_item_id"?: string | null,"current_served_at"?: string | null,"id"?: string,"last_activity_at"?: string,"learning_path_id": string,"mode"?: string,"report"?: Json | null,"skipped"?: NonNullable<Json>,"started_at"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "applied_at"?: string | null,"assessment_id"?: string,"completed_at"?: string | null,"current_item_id"?: string | null,"current_served_at"?: string | null,"id"?: string,"last_activity_at"?: string,"learning_path_id"?: string,"mode"?: string,"report"?: Json | null,"skipped"?: NonNullable<Json>,"started_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_attempts_assessment_id_fkey"
      columns: ["assessment_id"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_attempts_current_item_id_fkey"
      columns: ["current_item_id"]
isOneToOne: false
      referencedRelation: "assessment_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_attempts_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_items": {
                  Row: {
                    "answer_key": string,"assessment_id": string,"content_hash": string,"created_at": string,"difficulty": number,"explanation": Json | null,"id": string,"is_demo": boolean,"item_type": string,"key": string,"key_confidence": string,"language_code": string,"level_code": string,"prompt": NonNullable<Json>,"reviewed_at": string | null,"reviewed_by": string | null,"skill": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_key": string,"assessment_id": string,"content_hash": string,"created_at"?: string,"difficulty": number,"explanation"?: Json | null,"id": string,"is_demo"?: boolean,"item_type": string,"key": string,"key_confidence"?: string,"language_code": string,"level_code": string,"prompt": NonNullable<Json>,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"skill": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "answer_key"?: string,"assessment_id"?: string,"content_hash"?: string,"created_at"?: string,"difficulty"?: number,"explanation"?: Json | null,"id"?: string,"is_demo"?: boolean,"item_type"?: string,"key"?: string,"key_confidence"?: string,"language_code"?: string,"level_code"?: string,"prompt"?: NonNullable<Json>,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"skill"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_items_assessment_fk"
      columns: ["assessment_id","language_code"]
isOneToOne: false
      referencedRelation: "assessments"
      referencedColumns: ["id","language_code"]
    },{
      foreignKeyName: "assessment_items_level_fk"
      columns: ["language_code","level_code"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    }
                  ]
                },"assessment_responses": {
                  Row: {
                    "answered_at": string,"attempt_id": string,"choice": string | null,"is_correct": boolean,"item_id": string,"seq": number,"served_at": string,"skill": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string,"attempt_id": string,"choice"?: string | null,"is_correct": boolean,"item_id": string,"seq": number,"served_at": string,"skill": string
                  }
                  Update: {
                    "answered_at"?: string,"attempt_id"?: string,"choice"?: string | null,"is_correct"?: boolean,"item_id"?: string,"seq"?: number,"served_at"?: string,"skill"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_responses_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "assessment_attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_responses_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "assessment_items"
      referencedColumns: ["id"]
    }
                  ]
                },"assessments": {
                  Row: {
                    "assessment_type": string,"config": NonNullable<Json>,"created_at": string,"id": string,"is_published": boolean,"key": string,"language_code": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_type": string,"config": NonNullable<Json>,"created_at"?: string,"id": string,"is_published"?: boolean,"key": string,"language_code": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "assessment_type"?: string,"config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_published"?: boolean,"key"?: string,"language_code"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"assignments": {
                  Row: {
                    "class_id": string,"created_at": string,"due_at": string | null,"exam_form_id": string | null,"id": string,"kind": string,"lesson_id": string | null,"note": string | null,"target_count": number | null,"teacher_assignment_json": Json | null,"teacher_assignment_title": string | null
                  }
                  ComputedFields: "teacher_assignment_json" | "teacher_assignment_title"
                  Insert: {
                    "class_id": string,"created_at"?: string,"due_at"?: string | null,"exam_form_id"?: string | null,"id"?: string,"kind": string,"lesson_id"?: string | null,"note"?: string | null,"target_count"?: number | null
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"due_at"?: string | null,"exam_form_id"?: string | null,"id"?: string,"kind"?: string,"lesson_id"?: string | null,"note"?: string | null,"target_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignments_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_exam_form_id_fkey"
      columns: ["exam_form_id"]
isOneToOne: false
      referencedRelation: "exam_forms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"attempts": {
                  Row: {
                    "after_reveal": boolean,"attempt_no": number,"client_at": string | null,"confidence": number | null,"content_version": number,"created_at": string,"error_tags": (string)[],"exercise_id": string,"exercise_type": string,"exercise_version": number,"feedback_json": NonNullable<Json>,"gave_up": boolean,"hint_count": number,"id": string,"idempotency_key": string,"is_correct": boolean,"learning_item_id": string | null,"learning_path_id": string,"lesson_id": string,"lesson_run_id": string,"modality": string | null,"normalized_response": string | null,"payload_hash": string,"response_json": NonNullable<Json>,"response_ms": number,"revealed": boolean,"score": number,"stage": string,"synced_late": boolean,"user_id": string,"verdict": string
                  }
                  ComputedFields: never
                  Insert: {
                    "after_reveal": boolean,"attempt_no": number,"client_at"?: string | null,"confidence"?: number | null,"content_version": number,"created_at"?: string,"error_tags"?: (string)[],"exercise_id": string,"exercise_type": string,"exercise_version": number,"feedback_json": NonNullable<Json>,"gave_up": boolean,"hint_count": number,"id"?: string,"idempotency_key": string,"is_correct": boolean,"learning_item_id"?: string | null,"learning_path_id": string,"lesson_id": string,"lesson_run_id": string,"modality"?: string | null,"normalized_response"?: string | null,"payload_hash": string,"response_json": NonNullable<Json>,"response_ms": number,"revealed": boolean,"score": number,"stage": string,"synced_late"?: boolean,"user_id": string,"verdict": string
                  }
                  Update: {
                    "after_reveal"?: boolean,"attempt_no"?: number,"client_at"?: string | null,"confidence"?: number | null,"content_version"?: number,"created_at"?: string,"error_tags"?: (string)[],"exercise_id"?: string,"exercise_type"?: string,"exercise_version"?: number,"feedback_json"?: NonNullable<Json>,"gave_up"?: boolean,"hint_count"?: number,"id"?: string,"idempotency_key"?: string,"is_correct"?: boolean,"learning_item_id"?: string | null,"learning_path_id"?: string,"lesson_id"?: string,"lesson_run_id"?: string,"modality"?: string | null,"normalized_response"?: string | null,"payload_hash"?: string,"response_json"?: NonNullable<Json>,"response_ms"?: number,"revealed"?: boolean,"score"?: number,"stage"?: string,"synced_late"?: boolean,"user_id"?: string,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_learning_item_id_fkey"
      columns: ["learning_item_id"]
isOneToOne: false
      referencedRelation: "learning_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_lesson_run_id_fkey"
      columns: ["lesson_run_id"]
isOneToOne: false
      referencedRelation: "lesson_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"audio_assets": {
                  Row: {
                    "byte_size": number,"created_at": string,"duration_ms": number,"id": string,"lang": string,"mime_type": string,"model": string,"storage_path": string,"text_sha256": string,"voice": string
                  }
                  ComputedFields: never
                  Insert: {
                    "byte_size": number,"created_at"?: string,"duration_ms": number,"id": string,"lang": string,"mime_type"?: string,"model": string,"storage_path": string,"text_sha256": string,"voice": string
                  }
                  Update: {
                    "byte_size"?: number,"created_at"?: string,"duration_ms"?: number,"id"?: string,"lang"?: string,"mime_type"?: string,"model"?: string,"storage_path"?: string,"text_sha256"?: string,"voice"?: string
                  }
                  Relationships: [
                    
                  ]
                },"class_invites": {
                  Row: {
                    "class_id": string,"code": string,"created_at": string,"expires_at": string,"max_uses": number | null,"revoked_at": string | null,"uses": number
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"code": string,"created_at"?: string,"expires_at": string,"max_uses"?: number | null,"revoked_at"?: string | null,"uses"?: number
                  }
                  Update: {
                    "class_id"?: string,"code"?: string,"created_at"?: string,"expires_at"?: string,"max_uses"?: number | null,"revoked_at"?: string | null,"uses"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_invites_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    }
                  ]
                },"class_join_attempts": {
                  Row: {
                    "created_at": string,"id": string,"succeeded": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"succeeded": boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"succeeded"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"class_members": {
                  Row: {
                    "class_id": string,"joined_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"joined_at"?: string,"user_id": string
                  }
                  Update: {
                    "class_id"?: string,"joined_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_members_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"language_code": string,"name": string,"teacher_id": string,"updated_at": string,"teacher_class_json": Json | null
                  }
                  ComputedFields: "teacher_class_json"
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"language_code": string,"name": string,"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"language_code"?: string,"name"?: string,"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"content_reports": {
                  Row: {
                    "content_version": number | null,"created_at": string,"id": string,"note": string | null,"reason": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": string,"target_id": string,"target_kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_version"?: number | null,"created_at"?: string,"id"?: string,"note"?: string | null,"reason": string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"target_id": string,"target_kind": string,"user_id": string
                  }
                  Update: {
                    "content_version"?: number | null,"created_at"?: string,"id"?: string,"note"?: string | null,"reason"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"target_id"?: string,"target_kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"content_sources": {
                  Row: {
                    "attribution_required": boolean,"author_or_org": string,"content_hash": string,"created_at": string,"id": string,"is_demo": boolean,"key": string,"license": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"title": string,"updated_at": string,"url": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attribution_required"?: boolean,"author_or_org": string,"content_hash": string,"created_at"?: string,"id": string,"is_demo"?: boolean,"key": string,"license": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"url"?: string | null,"version"?: number
                  }
                  Update: {
                    "attribution_required"?: boolean,"author_or_org"?: string,"content_hash"?: string,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"key"?: string,"license"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"url"?: string | null,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"exam_answers": {
                  Row: {
                    "answer": string | null,"attempt_id": string,"created_at": string,"flagged": boolean,"idempotency_key": string,"payload_hash": string,"question_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: string | null,"attempt_id": string,"created_at"?: string,"flagged"?: boolean,"idempotency_key": string,"payload_hash": string,"question_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answer"?: string | null,"attempt_id"?: string,"created_at"?: string,"flagged"?: boolean,"idempotency_key"?: string,"payload_hash"?: string,"question_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exam_answers_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "exam_attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exam_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "exam_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"exam_attempts": {
                  Row: {
                    "activity_counted_at": string | null,"content_version": number,"deadline_at": string | null,"form_id": string,"id": string,"learning_path_id": string,"mode": string,"question_ids": (string)[],"question_type": string | null,"result": Json | null,"section": string | null,"started_at": string,"status": string,"submitted_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_counted_at"?: string | null,"content_version": number,"deadline_at"?: string | null,"form_id": string,"id"?: string,"learning_path_id": string,"mode": string,"question_ids": (string)[],"question_type"?: string | null,"result"?: Json | null,"section"?: string | null,"started_at"?: string,"status"?: string,"submitted_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "activity_counted_at"?: string | null,"content_version"?: number,"deadline_at"?: string | null,"form_id"?: string,"id"?: string,"learning_path_id"?: string,"mode"?: string,"question_ids"?: (string)[],"question_type"?: string | null,"result"?: Json | null,"section"?: string | null,"started_at"?: string,"status"?: string,"submitted_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exam_attempts_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "exam_forms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exam_attempts_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"exam_forms": {
                  Row: {
                    "content_hash": string,"created_at": string,"description_vi": string,"family": string,"id": string,"is_demo": boolean,"key": string,"language_code": string,"level_from": string,"level_to": string,"reviewed_at": string | null,"reviewed_by": string | null,"scoring": NonNullable<Json>,"source_id": string,"status": string,"time_limits": NonNullable<Json>,"title_vi": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"created_at"?: string,"description_vi": string,"family": string,"id": string,"is_demo"?: boolean,"key": string,"language_code": string,"level_from": string,"level_to": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"scoring": NonNullable<Json>,"source_id": string,"status"?: string,"time_limits": NonNullable<Json>,"title_vi": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "content_hash"?: string,"created_at"?: string,"description_vi"?: string,"family"?: string,"id"?: string,"is_demo"?: boolean,"key"?: string,"language_code"?: string,"level_from"?: string,"level_to"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"scoring"?: NonNullable<Json>,"source_id"?: string,"status"?: string,"time_limits"?: NonNullable<Json>,"title_vi"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "exam_forms_level_from_fk"
      columns: ["language_code","level_from"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "exam_forms_level_to_fk"
      columns: ["language_code","level_to"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "exam_forms_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"exam_questions": {
                  Row: {
                    "created_at": string,"form_id": string,"id": string,"key": string,"kind": string,"level_code": string,"points": number,"prompt": NonNullable<Json>,"question_type": string,"section": string,"seq": number,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"form_id": string,"id": string,"key": string,"kind": string,"level_code": string,"points": number,"prompt": NonNullable<Json>,"question_type": string,"section": string,"seq": number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"form_id"?: string,"id"?: string,"key"?: string,"kind"?: string,"level_code"?: string,"points"?: number,"prompt"?: NonNullable<Json>,"question_type"?: string,"section"?: string,"seq"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exam_questions_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "exam_forms"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "answer_lang": string,"content_hash": string,"created_at": string,"difficulty": number,"exercise_type": string,"id": string,"is_demo": boolean,"item_id": string | null,"key": string,"lesson_id": string,"order_index": number,"prompt": NonNullable<Json>,"reviewed_at": string | null,"reviewed_by": string | null,"source_id": string,"stage": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_lang": string,"content_hash": string,"created_at"?: string,"difficulty": number,"exercise_type": string,"id": string,"is_demo"?: boolean,"item_id"?: string | null,"key": string,"lesson_id": string,"order_index": number,"prompt": NonNullable<Json>,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id": string,"stage": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "answer_lang"?: string,"content_hash"?: string,"created_at"?: string,"difficulty"?: number,"exercise_type"?: string,"id"?: string,"is_demo"?: boolean,"item_id"?: string | null,"key"?: string,"lesson_id"?: string,"order_index"?: number,"prompt"?: NonNullable<Json>,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id"?: string,"stage"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "learning_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercises_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercises_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_items": {
                  Row: {
                    "audio_path": string | null,"back": NonNullable<Json>,"content_hash": string,"created_at": string,"difficulty": number,"front": NonNullable<Json>,"id": string,"is_demo": boolean,"item_type": string,"key": string,"language_code": string,"level_code": string,"reviewed_at": string | null,"reviewed_by": string | null,"skill_tags": (string)[],"source_id": string,"status": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_path"?: string | null,"back": NonNullable<Json>,"content_hash": string,"created_at"?: string,"difficulty": number,"front": NonNullable<Json>,"id": string,"is_demo"?: boolean,"item_type": string,"key": string,"language_code": string,"level_code": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"skill_tags"?: (string)[],"source_id": string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "audio_path"?: string | null,"back"?: NonNullable<Json>,"content_hash"?: string,"created_at"?: string,"difficulty"?: number,"front"?: NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"item_type"?: string,"key"?: string,"language_code"?: string,"level_code"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"skill_tags"?: (string)[],"source_id"?: string,"status"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_items_level_fk"
      columns: ["language_code","level_code"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "learning_items_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_paths": {
                  Row: {
                    "created_at": string,"current_level": string,"estimate": NonNullable<Json>,"goal_type": string,"id": string,"language_code": string,"start_point": string,"status": string,"target_date": string | null,"target_level": string,"updated_at": string,"user_id": string,"weekly_minutes": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_level": string,"estimate": NonNullable<Json>,"goal_type": string,"id"?: string,"language_code": string,"start_point": string,"status"?: string,"target_date"?: string | null,"target_level": string,"updated_at"?: string,"user_id": string,"weekly_minutes": (number)[]
                  }
                  Update: {
                    "created_at"?: string,"current_level"?: string,"estimate"?: NonNullable<Json>,"goal_type"?: string,"id"?: string,"language_code"?: string,"start_point"?: string,"status"?: string,"target_date"?: string | null,"target_level"?: string,"updated_at"?: string,"user_id"?: string,"weekly_minutes"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_paths_current_level_fk"
      columns: ["language_code","current_level"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "learning_paths_target_level_fk"
      columns: ["language_code","target_level"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    }
                  ]
                },"lesson_items": {
                  Row: {
                    "item_id": string,"lesson_id": string,"position": number,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "item_id": string,"lesson_id": string,"position": number,"role": string
                  }
                  Update: {
                    "item_id"?: string,"lesson_id"?: string,"position"?: number,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "learning_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_items_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_prerequisites": {
                  Row: {
                    "lesson_id": string,"prerequisite_lesson_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "lesson_id": string,"prerequisite_lesson_id": string
                  }
                  Update: {
                    "lesson_id"?: string,"prerequisite_lesson_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_prerequisites_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_prerequisites_prerequisite_lesson_id_fkey"
      columns: ["prerequisite_lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_runs": {
                  Row: {
                    "completed_at": string | null,"content_version": number,"cursor": number,"id": string,"learning_path_id": string,"lesson_id": string,"next_review_at": string | null,"queue": (string)[],"started_at": string,"status": string,"summary_json": Json | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"content_version": number,"cursor"?: number,"id"?: string,"learning_path_id": string,"lesson_id": string,"next_review_at"?: string | null,"queue": (string)[],"started_at"?: string,"status"?: string,"summary_json"?: Json | null,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"content_version"?: number,"cursor"?: number,"id"?: string,"learning_path_id"?: string,"lesson_id"?: string,"next_review_at"?: string | null,"queue"?: (string)[],"started_at"?: string,"status"?: string,"summary_json"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_runs_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_runs_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "body": NonNullable<Json>,"content_hash": string,"content_version": number | null,"created_at": string,"estimated_minutes": number,"id": string,"is_demo": boolean,"key": string,"language_code": string,"level_code": string,"objectives": NonNullable<Json>,"order_index": number,"published_at": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"skills": (string)[],"source_id": string,"status": string,"title": NonNullable<Json>,"unit_id": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body": NonNullable<Json>,"content_hash": string,"content_version"?: never,"created_at"?: string,"estimated_minutes": number,"id": string,"is_demo"?: boolean,"key": string,"language_code": string,"level_code": string,"objectives": NonNullable<Json>,"order_index": number,"published_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"skills": (string)[],"source_id": string,"status"?: string,"title": NonNullable<Json>,"unit_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "body"?: NonNullable<Json>,"content_hash"?: string,"content_version"?: never,"created_at"?: string,"estimated_minutes"?: number,"id"?: string,"is_demo"?: boolean,"key"?: string,"language_code"?: string,"level_code"?: string,"objectives"?: NonNullable<Json>,"order_index"?: number,"published_at"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"skills"?: (string)[],"source_id"?: string,"status"?: string,"title"?: NonNullable<Json>,"unit_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_level_fk"
      columns: ["language_code","level_code"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "lessons_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"level_reference_hours": {
                  Row: {
                    "cumulative_hours": number,"language_code": string,"level_code": string,"ordinal": number,"reviewed": boolean,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cumulative_hours": number,"language_code": string,"level_code": string,"ordinal": number,"reviewed"?: boolean,"source": string
                  }
                  Update: {
                    "cumulative_hours"?: number,"language_code"?: string,"level_code"?: string,"ordinal"?: number,"reviewed"?: boolean,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_prefs": {
                  Row: {
                    "backoff_level": number,"backoff_relief_day": string | null,"ignored_streak": number,"max_per_day": number,"push_enabled": boolean,"quiet_end": string,"quiet_start": string,"remind_at": string,"remind_days": (number)[],"reminders_enabled": boolean,"updated_at": string,"user_id": string,"weekly_summary": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "backoff_level"?: number,"backoff_relief_day"?: string | null,"ignored_streak"?: number,"max_per_day"?: number,"push_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"remind_at"?: string,"remind_days"?: (number)[],"reminders_enabled"?: boolean,"updated_at"?: string,"user_id": string,"weekly_summary"?: boolean
                  }
                  Update: {
                    "backoff_level"?: number,"backoff_relief_day"?: string | null,"ignored_streak"?: number,"max_per_day"?: number,"push_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"remind_at"?: string,"remind_days"?: (number)[],"reminders_enabled"?: boolean,"updated_at"?: string,"user_id"?: string,"weekly_summary"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "action_url": string,"body_vi": string,"clicked_at": string | null,"created_at": string,"delivered_push_at": string | null,"id": string,"ignore_checked": boolean,"kind": string,"local_day": string,"payload": NonNullable<Json>,"read_at": string | null,"title_vi": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_url": string,"body_vi": string,"clicked_at"?: string | null,"created_at"?: string,"delivered_push_at"?: string | null,"id"?: string,"ignore_checked"?: boolean,"kind": string,"local_day": string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"title_vi": string,"user_id": string
                  }
                  Update: {
                    "action_url"?: string,"body_vi"?: string,"clicked_at"?: string | null,"created_at"?: string,"delivered_push_at"?: string | null,"id"?: string,"ignore_checked"?: boolean,"kind"?: string,"local_day"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"title_vi"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"offline_pack_requests": {
                  Row: {
                    "id": string,"requested_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"requested_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"requested_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"personal_vocab_imports": {
                  Row: {
                    "added": number,"created_at": string,"id": string,"list_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added"?: number,"created_at"?: string,"id"?: string,"list_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "added"?: number,"created_at"?: string,"id"?: string,"list_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_vocab_imports_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "personal_word_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_word_lists": {
                  Row: {
                    "created_at": string,"id": string,"language_code": string,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"language_code": string,"name": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"language_code"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"personal_words": {
                  Row: {
                    "created_at": string,"difficulty": number | null,"due_at": string,"example": string | null,"fsrs_state": string,"id": string,"lapses": number,"last_grade_key": string | null,"last_grade_rating": number | null,"last_grade_result": Json | null,"last_review_at": string | null,"list_id": string,"meaning": string,"note": string | null,"position": number,"pronunciation": string | null,"reps": number,"scheduled_days": number,"stability": number | null,"step": number,"term": string,"term_key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"difficulty"?: number | null,"due_at"?: string,"example"?: string | null,"fsrs_state"?: string,"id"?: string,"lapses"?: number,"last_grade_key"?: string | null,"last_grade_rating"?: number | null,"last_grade_result"?: Json | null,"last_review_at"?: string | null,"list_id": string,"meaning": string,"note"?: string | null,"position"?: number,"pronunciation"?: string | null,"reps"?: number,"scheduled_days"?: number,"stability"?: number | null,"step"?: number,"term": string,"term_key": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"difficulty"?: number | null,"due_at"?: string,"example"?: string | null,"fsrs_state"?: string,"id"?: string,"lapses"?: number,"last_grade_key"?: string | null,"last_grade_rating"?: number | null,"last_grade_result"?: Json | null,"last_review_at"?: string | null,"list_id"?: string,"meaning"?: string,"note"?: string | null,"position"?: number,"pronunciation"?: string | null,"reps"?: number,"scheduled_days"?: number,"stability"?: number | null,"step"?: number,"term"?: string,"term_key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_words_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "personal_word_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"current_learning_path_id": string | null,"display_name": string | null,"id": string,"locale": string,"timezone": string,"timezone_changed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"current_learning_path_id"?: string | null,"display_name"?: string | null,"id": string,"locale"?: string,"timezone"?: string,"timezone_changed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"current_learning_path_id"?: string | null,"display_name"?: string | null,"id"?: string,"locale"?: string,"timezone"?: string,"timezone_changed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_current_learning_path_id_fkey"
      columns: ["current_learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "content_hash": string,"created_at": string,"description": NonNullable<Json>,"goal_types": (string)[],"id": string,"is_demo": boolean,"key": string,"kind": string,"language_code": string,"level_from": string,"level_to": string,"order_index": number,"reviewed_at": string | null,"reviewed_by": string | null,"source_id": string,"status": string,"title": NonNullable<Json>,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"created_at"?: string,"description": NonNullable<Json>,"goal_types"?: (string)[],"id": string,"is_demo"?: boolean,"key": string,"kind": string,"language_code": string,"level_from": string,"level_to": string,"order_index": number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id": string,"status"?: string,"title": NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "content_hash"?: string,"created_at"?: string,"description"?: NonNullable<Json>,"goal_types"?: (string)[],"id"?: string,"is_demo"?: boolean,"key"?: string,"kind"?: string,"language_code"?: string,"level_from"?: string,"level_to"?: string,"order_index"?: number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id"?: string,"status"?: string,"title"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_level_from_fk"
      columns: ["language_code","level_from"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "programs_level_to_fk"
      columns: ["language_code","level_to"]
isOneToOne: false
      referencedRelation: "level_reference_hours"
      referencedColumns: ["language_code","level_code"]
    },{
      foreignKeyName: "programs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscription_saves": {
                  Row: {
                    "id": string,"saved_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"saved_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"saved_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"failure_count": number,"id": string,"last_success_at": string | null,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"failure_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"failure_count"?: number,"id"?: string,"last_success_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_cards": {
                  Row: {
                    "created_at": string,"difficulty": number | null,"direction": string,"due_at": string,"fsrs_state": string,"id": string,"lapses": number,"last_postponed_on": string | null,"last_review_at": string | null,"learning_item_id": string,"learning_path_id": string,"postpone_count": number,"reps": number,"scheduled_days": number,"stability": number | null,"step": number,"suspended_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"difficulty"?: number | null,"direction": string,"due_at": string,"fsrs_state"?: string,"id"?: string,"lapses"?: number,"last_postponed_on"?: string | null,"last_review_at"?: string | null,"learning_item_id": string,"learning_path_id": string,"postpone_count"?: number,"reps"?: number,"scheduled_days"?: number,"stability"?: number | null,"step"?: number,"suspended_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"difficulty"?: number | null,"direction"?: string,"due_at"?: string,"fsrs_state"?: string,"id"?: string,"lapses"?: number,"last_postponed_on"?: string | null,"last_review_at"?: string | null,"learning_item_id"?: string,"learning_path_id"?: string,"postpone_count"?: number,"reps"?: number,"scheduled_days"?: number,"stability"?: number | null,"step"?: number,"suspended_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_cards_learning_item_id_fkey"
      columns: ["learning_item_id"]
isOneToOne: false
      referencedRelation: "learning_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_cards_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"review_item_mastery": {
                  Row: {
                    "learning_item_id": string,"learning_path_id": string,"mastered_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "learning_item_id": string,"learning_path_id": string,"mastered_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "learning_item_id"?: string,"learning_path_id"?: string,"mastered_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_item_mastery_learning_item_id_fkey"
      columns: ["learning_item_id"]
isOneToOne: false
      referencedRelation: "learning_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_item_mastery_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"review_logs": {
                  Row: {
                    "card_id": string | null,"client_at": string | null,"confidence": number | null,"created_at": string,"hint_count": number | null,"id": string,"idempotency_key": string,"kind": string,"learning_path_id": string,"local_day": string,"payload_hash": string,"rating_effective": number | null,"rating_raw": number | null,"response_ms": number | null,"result": Json | null,"state_after": Json | null,"state_before": Json | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "card_id"?: string | null,"client_at"?: string | null,"confidence"?: number | null,"created_at"?: string,"hint_count"?: number | null,"id"?: string,"idempotency_key": string,"kind": string,"learning_path_id": string,"local_day": string,"payload_hash": string,"rating_effective"?: number | null,"rating_raw"?: number | null,"response_ms"?: number | null,"result"?: Json | null,"state_after"?: Json | null,"state_before"?: Json | null,"user_id": string
                  }
                  Update: {
                    "card_id"?: string | null,"client_at"?: string | null,"confidence"?: number | null,"created_at"?: string,"hint_count"?: number | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"learning_path_id"?: string,"local_day"?: string,"payload_hash"?: string,"rating_effective"?: number | null,"rating_raw"?: number | null,"response_ms"?: number | null,"result"?: Json | null,"state_after"?: Json | null,"state_before"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_logs_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "review_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_logs_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"skill_estimates": {
                  Row: {
                    "assessed_at": string,"confidence": string,"id": string,"learning_path_id": string,"level_code": string,"sample_size": number,"skill": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessed_at"?: string,"confidence": string,"id"?: string,"learning_path_id": string,"level_code": string,"sample_size"?: number,"skill": string,"source": string
                  }
                  Update: {
                    "assessed_at"?: string,"confidence"?: string,"id"?: string,"learning_path_id"?: string,"level_code"?: string,"sample_size"?: number,"skill"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_estimates_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"srs_config": {
                  Row: {
                    "cap_max": number,"cap_min": number,"cap_per_minute": number,"daily_new_limit": number,"desired_retention": number,"id": boolean,"learning_steps_minutes": (number)[],"mastery_min_days": number,"mastery_min_recall_stability": number,"mastery_min_successes": number,"maximum_interval": number,"recovery_factor": number,"relearning_steps_minutes": (number)[],"updated_at": string,"weights": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "cap_max"?: number,"cap_min"?: number,"cap_per_minute"?: number,"daily_new_limit"?: number,"desired_retention"?: number,"id"?: boolean,"learning_steps_minutes"?: (number)[],"mastery_min_days"?: number,"mastery_min_recall_stability"?: number,"mastery_min_successes"?: number,"maximum_interval"?: number,"recovery_factor"?: number,"relearning_steps_minutes"?: (number)[],"updated_at"?: string,"weights": (number)[]
                  }
                  Update: {
                    "cap_max"?: number,"cap_min"?: number,"cap_per_minute"?: number,"daily_new_limit"?: number,"desired_retention"?: number,"id"?: boolean,"learning_steps_minutes"?: (number)[],"mastery_min_days"?: number,"mastery_min_recall_stability"?: number,"mastery_min_successes"?: number,"maximum_interval"?: number,"recovery_factor"?: number,"relearning_steps_minutes"?: (number)[],"updated_at"?: string,"weights"?: (number)[]
                  }
                  Relationships: [
                    
                  ]
                },"staff_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"study_sessions": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"id": string,"local_date": string,"minutes_planned": number,"path_id": string,"plan": NonNullable<Json>,"started_at": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"local_date": string,"minutes_planned": number,"path_id": string,"plan": NonNullable<Json>,"started_at"?: string | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"local_date"?: string,"minutes_planned"?: number,"path_id"?: string,"plan"?: NonNullable<Json>,"started_at"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_sessions_path_id_fkey"
      columns: ["path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_profiles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"units": {
                  Row: {
                    "content_hash": string,"created_at": string,"id": string,"is_demo": boolean,"key": string,"order_index": number,"program_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"source_id": string,"status": string,"title": NonNullable<Json>,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"created_at"?: string,"id": string,"is_demo"?: boolean,"key": string,"order_index": number,"program_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id": string,"status"?: string,"title": NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "content_hash"?: string,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"key"?: string,"order_index"?: number,"program_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id"?: string,"status"?: string,"title"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "units_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "units_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"user_badges": {
                  Row: {
                    "badge_key": string,"earned_at": string,"learning_path_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "badge_key": string,"earned_at"?: string,"learning_path_id": string,"user_id": string
                  }
                  Update: {
                    "badge_key"?: string,"earned_at"?: string,"learning_path_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_badges_learning_path_id_fkey"
      columns: ["learning_path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "ai_notice_ack_at": string | null,"analytics_opt_out": boolean,"reduce_motion": boolean,"show_motivation": boolean,"theme": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_notice_ack_at"?: string | null,"analytics_opt_out"?: boolean,"reduce_motion"?: boolean,"show_motivation"?: boolean,"theme"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_notice_ack_at"?: string | null,"analytics_opt_out"?: boolean,"reduce_motion"?: boolean,"show_motivation"?: boolean,"theme"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_diagnostic_placement":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"account_optional_tables":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"ack_ai_notice":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"admin_ai_usage":
{ Args: { "p_days": number }; Returns: Json
                           },
"admin_analytics":
{ Args: { "p_days": number }; Returns: Json
                           },
"admin_audit_log_recent":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"admin_content_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_find_user":
{ Args: { "p_query": string }; Returns: Json
                           },
"admin_get_content":
{ Args: { "p_id": string,"p_kind": string }; Returns: Json
                           },
"admin_grant_role":
{ Args: { "p_role": string,"p_user_id": string }; Returns: Json
                           },
"admin_item_open_reports":
{ Args: { "p_id": string,"p_kind": string }; Returns: number
                           },
"admin_list_content":
{ Args: { "p_kind"?: string,"p_language"?: string,"p_limit"?: number,"p_offset"?: number,"p_search"?: string,"p_status"?: string }; Returns: Json
                           },
"admin_list_reports":
{ Args: { "p_kind"?: string,"p_limit"?: number,"p_offset"?: number,"p_status"?: string }; Returns: Json
                           },
"admin_list_sources":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_list_staff":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_list_teachers":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_resolve_report":
{ Args: { "p_report_ids": (string)[],"p_resolution_note"?: string,"p_status": string }; Returns: Json
                           },
"admin_set_status":
{ Args: { "p_force"?: boolean,"p_id": string,"p_kind": string,"p_note"?: string,"p_status": string }; Returns: Json
                           },
"ai_cache_get":
{ Args: { "p_key": string }; Returns: Json
                           },
"ai_cache_put":
{ Args: { "p_key": string,"p_model": string,"p_payload": Json,"p_prompt_version": string,"p_task": string }; Returns: undefined
                           },
"ai_check_limit":
{ Args: { "p_limit": number }; Returns: undefined
                           },
"ai_quota_consume":
{ Args: { "p_limit": number }; Returns: Json
                           },
"ai_quota_refund":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"ai_quota_resets_at":
{ Args: { "p_user": string }; Returns: string
                           },
"ai_quota_status":
{ Args: { "p_limit": number }; Returns: Json
                           },
"ai_report":
{ Args: { "p_note": string,"p_reason": string,"p_usage_id": string }; Returns: string
                           },
"ai_usage_log":
{ Args: { "p_attempts": number,"p_cached": boolean,"p_http_status": number,"p_input_chars": number,"p_latency_ms": number,"p_model": string,"p_prompt_version": string,"p_repaired": boolean,"p_status": string,"p_task": string,"p_user_id": string }; Returns: string
                           },
"answer_diagnostic":
{ Args: { "p_attempt_id": string,"p_choice": string,"p_item_id": string }; Returns: Json
                           },
"class_access":
{ Args: { "p_class_id": string }; Returns: string
                           },
"complete_lesson":
{ Args: { "p_client_at"?: string,"p_run_id": string }; Returns: Json
                           },
"content_report_target_version":
{ Args: { "p_id": string,"p_kind": string }; Returns: number
                           },
"content_target_label":
{ Args: { "p_id": string,"p_kind": string,"p_max"?: number }; Returns: string
                           },
"create_learning_path":
{ Args: { "p_current_level": string,"p_goal_type": string,"p_language": string,"p_start_point": string,"p_target_date"?: string,"p_target_level": string,"p_weekly_minutes": (number)[] }; Returns: {
              "created_at": string,
"current_level": string,
"estimate": NonNullable<Json>,
"goal_type": string,
"id": string,
"language_code": string,
"start_point": string,
"status": string,
"target_date": string | null,
"target_level": string,
"updated_at": string,
"user_id": string,
"weekly_minutes": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "learning_paths"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_personal_list":
{ Args: { "p_language": string,"p_name": string }; Returns: Json
                           },
"delete_my_account":
{ Args: { "p_confirm": string }; Returns: undefined
                           },
"delete_personal_list":
{ Args: { "p_list_id": string }; Returns: Json
                           },
"delete_personal_word":
{ Args: { "p_word_id": string }; Returns: Json
                           },
"delete_push_subscription":
{ Args: { "p_endpoint": string }; Returns: undefined
                           },
"diag_cap_level":
{ Args: { "p_current": number,"p_first_applied": boolean,"p_suggested": number }; Returns: number
                           },
"diag_confidence":
{ Args: { "p_n": number,"p_rapid_share": number,"p_sd": number }; Returns: string
                           },
"diag_conservative_level":
{ Args: { "p_weights": (number)[] }; Returns: number
                           },
"diag_eap":
{ Args: { "p_weights": (number)[] }; Returns: Json
                           },
"diag_grid":
{ Args: Record<PropertyKey, never>; Returns: (number)[]
                           },
"diag_level_range":
{ Args: { "p_weights": (number)[] }; Returns: Json
                           },
"diag_posterior":
{ Args: { "p_b": (number)[],"p_correct": (boolean)[],"p_mean": number,"p_options": (number)[],"p_sd": number }; Returns: (number)[]
                           },
"diag_should_stop_skill":
{ Args: { "p_bank_left": number,"p_n": number,"p_sd": number,"p_skill": string }; Returns: boolean
                           },
"diag_suggest_level":
{ Args: { "p_confidences": (string)[],"p_levels": (number)[] }; Returns: number
                           },
"diagnostic_active_attempt":
{ Args: { "p_attempt_id": string,"p_user": string }; Returns: {
              "applied_at": string | null,
"assessment_id": string,
"completed_at": string | null,
"current_item_id": string | null,
"current_served_at": string | null,
"id": string,
"last_activity_at": string,
"learning_path_id": string,
"mode": string,
"report": Json | null,
"skipped": NonNullable<Json>,
"started_at": string,
"status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "assessment_attempts"
        isOneToOne: true
        isSetofReturn: false
      } },
"diagnostic_advance":
{ Args: { "p_attempt_id": string }; Returns: undefined
                           },
"diagnostic_assessment_for":
{ Args: { "p_language": string }; Returns: string
                           },
"diagnostic_attempt_state":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"diagnostic_bank_available":
{ Args: { "p_assessment_id": string,"p_mode": string }; Returns: boolean
                           },
"diagnostic_bank_left":
{ Args: { "p_attempt_id": string,"p_skill": string }; Returns: number
                           },
"diagnostic_build_report":
{ Args: { "p_attempt_id": string,"p_completed_at": string }; Returns: Json
                           },
"diagnostic_config":
{ Args: { "p_assessment_id": string,"p_default": number,"p_key": string }; Returns: number
                           },
"diagnostic_level_code":
{ Args: { "p_language": string,"p_ordinal": number }; Returns: string
                           },
"diagnostic_level_ordinal":
{ Args: { "p_language": string,"p_level": string }; Returns: number
                           },
"diagnostic_pick_item":
{ Args: { "p_attempt_id": string,"p_eap": number,"p_seq": number,"p_skill": string }; Returns: string
                           },
"diagnostic_status":
{ Args: { "p_path_id": string }; Returns: Json
                           },
"diagnostic_step_json":
{ Args: { "p_attempt_id": string,"p_resumed": boolean }; Returns: Json
                           },
"estimate_learning_path":
{ Args: { "p_current_level": string,"p_language": string,"p_target_date": string,"p_target_level": string,"p_today": string,"p_weekly_minutes": (number)[] }; Returns: Json
                           },
"exam_attempt_activity":
{ Args: { "p_attempt_id": string }; Returns: {
              "active_ms": number,"n_answers": number
            }[]
                           },
"exam_attempt_activity_days":
{ Args: { "p_attempt_id": string }; Returns: {
              "active_ms": number,"local_day": string,"n_answers": number
            }[]
                           },
"exam_attempt_json":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"exam_backfill_activity":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"exam_build_result":
{ Args: { "p_attempt_id": string,"p_status": string,"p_submitted_at": string }; Returns: Json
                           },
"exam_close_attempt":
{ Args: { "p_attempt_id": string,"p_status": string }; Returns: Json
                           },
"exam_history":
{ Args: { "p_limit"?: number,"p_path_id": string }; Returns: Json
                           },
"exam_normalize_text":
{ Args: { "p_text": string }; Returns: string
                           },
"exam_overdue":
{ Args: { "p_deadline_at": string }; Returns: boolean
                           },
"exam_served_prompt":
{ Args: { "p_prompt": Json,"p_script": string }; Returns: Json
                           },
"exam_structure_warning":
{ Args: { "p_family": string,"p_goal_type": string }; Returns: string
                           },
"export_my_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"finish_diagnostic":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"finish_session":
{ Args: { "p_session_id": string,"p_status": string }; Returns: Json
                           },
"generate_due_notifications":
{ Args: { "p_now": string }; Returns: Json
                           },
"get_exam_attempt":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"get_lesson":
{ Args: { "p_lesson_id": string,"p_path_id": string }; Returns: Json
                           },
"get_notification_prefs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_personal_review_queue":
{ Args: { "p_limit"?: number,"p_list_id": string }; Returns: Json
                           },
"get_progress_dashboard":
{ Args: { "p_path_id": string,"p_range_days": number }; Returns: Json
                           },
"get_review_queue":
{ Args: { "p_extra"?: boolean,"p_limit"?: number,"p_path_id": string }; Returns: Json
                           },
"get_session_inputs":
{ Args: { "p_path_id": string }; Returns: Json
                           },
"get_today_session":
{ Args: { "p_path_id": string }; Returns: Json
                           },
"grade_exercise":
{ Args: { "p_answer": Json,"p_known_wrong": Json,"p_lang": string,"p_response": Json,"p_rubric": Json,"p_type": string }; Returns: Json
                           },
"grade_personal_word":
{ Args: { "p_idempotency_key": string,"p_rating": number,"p_word_id": string }; Returns: Json
                           },
"grade_review":
{ Args: { "p_card_id": string,"p_client_at": string,"p_confidence": number,"p_hint_count": number,"p_idempotency_key": string,"p_rating": number,"p_response_ms": number }; Returns: Json
                           },
"grading_normalize":
{ Args: { "p_lang": string,"p_rubric": Json,"p_text": string }; Returns: string
                           },
"grading_strip_diacritics":
{ Args: { "p_text": string }; Returns: string
                           },
"grading_text":
{ Args: { "p_accepted": Json,"p_known_wrong": Json,"p_lang": string,"p_rubric": Json,"p_text": string }; Returns: Json
                           },
"grant_teacher_role":
{ Args: { "p_grant": boolean,"p_user_id": string }; Returns: Json
                           },
"import_content_bundle":
{ Args: { "p_bundle": Json }; Returns: Json
                           },
"import_diagnostic_content_bundle":
{ Args: { "p_bundle": Json }; Returns: Json
                           },
"import_exam_content_bundle":
{ Args: { "p_bundle": Json }; Returns: Json
                           },
"import_personal_words":
{ Args: { "p_list_id": string,"p_rows": Json }; Returns: Json
                           },
"is_allowed_push_endpoint":
{ Args: { "p_endpoint": string }; Returns: boolean
                           },
"is_teacher":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"learner_class_json":
{ Args: { "p_class": Omit<Database["public"]['Tables']["classes"]['Row'], Database["public"]['Tables']["classes"]['ComputedFields']>,"p_joined_at": string,"p_user": string }; Returns: Json
                           },
"learner_join_class":
{ Args: { "p_code": string }; Returns: Json
                           },
"learner_leave_class":
{ Args: { "p_class_id": string }; Returns: Json
                           },
"learner_list_assignments":
{ Args: { "p_class_id"?: string }; Returns: Json
                           },
"learner_list_classes":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"learning_path_validate":
{ Args: { "p_current_level": string,"p_goal_type": string,"p_language": string,"p_target_date": string,"p_target_level": string,"p_today": string,"p_weekly_minutes": (number)[] }; Returns: undefined
                           },
"learning_user_today":
{ Args: { "p_user": string }; Returns: string
                           },
"lesson_for_path":
{ Args: { "p_lesson": string,"p_path": string,"p_user": string }; Returns: {
              "body": NonNullable<Json>,
"content_hash": string,
"content_version": number | null,
"created_at": string,
"estimated_minutes": number,
"id": string,
"is_demo": boolean,
"key": string,
"language_code": string,
"level_code": string,
"objectives": NonNullable<Json>,
"order_index": number,
"published_at": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"skills": (string)[],
"source_id": string,
"status": string,
"title": NonNullable<Json>,
"unit_id": string,
"updated_at": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "lessons"
        isOneToOne: true
        isSetofReturn: false
      } },
"lesson_response_valid":
{ Args: { "p_response": Json,"p_type": string }; Returns: boolean
                           },
"lesson_run_json":
{ Args: { "p_cursor": number,"p_id": string,"p_next_review_at": string,"p_queue": (string)[],"p_status": string,"p_summary": Json }; Returns: Json
                           },
"lesson_run_sync":
{ Args: { "p_content_version": number,"p_lesson_id": string,"p_run_id": string }; Returns: {
              "completed_at": string | null,
"content_version": number,
"cursor": number,
"id": string,
"learning_path_id": string,
"lesson_id": string,
"next_review_at": string | null,
"queue": (string)[],
"started_at": string,
"status": string,
"summary_json": Json | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "lesson_runs"
        isOneToOne: true
        isSetofReturn: false
      } },
"list_exam_forms":
{ Args: { "p_language": string }; Returns: Json
                           },
"list_my_reports":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"list_notifications":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: Json
                           },
"list_personal_lists":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mark_notification":
{ Args: { "p_action": string,"p_id": string }; Returns: undefined
                           },
"offline_lesson_manifest":
{ Args: { "p_path_id": string }; Returns: {
              "content_hash": string,"content_version": number,"exercise_versions_hash": string,"items_hash": string,"lesson_id": string
            }[]
                           },
"offline_lesson_packs":
{ Args: { "p_lesson_ids": (string)[],"p_path_id": string }; Returns: Json
                           },
"offline_lesson_public_json":
{ Args: { "p_lesson_id": string }; Returns: Json
                           },
"path_lessons":
{ Args: { "p_path_id": string }; Returns: {
              "estimated_minutes": number,"is_demo": boolean,"lesson_id": string,"lesson_key": string,"lesson_order": number,"level_code": string,"prerequisite_ids": (string)[],"prerequisites_met": boolean,"program_id": string,"program_title": Json,"run_status": string,"title": Json,"unit_id": string,"unit_order": number,"unit_title": Json
            }[]
                           },
"pending_push_notifications":
{ Args: { "p_limit"?: number,"p_now"?: string }; Returns: Json
                           },
"personal_clean":
{ Args: { "p_text": string }; Returns: string
                           },
"personal_day_end":
{ Args: { "p_user": string }; Returns: string
                           },
"personal_parse_rows":
{ Args: { "p_rows": Json }; Returns: {
              "dup": boolean,"example": string,"idx": number,"meaning": string,"note": string,"pronunciation": string,"reason": string,"term": string,"term_key": string
            }[]
                           },
"personal_term_key":
{ Args: { "p_term": string }; Returns: string
                           },
"personal_vocab_lock":
{ Args: { "p_user": string }; Returns: undefined
                           },
"personal_word_due":
{ Args: { "p_day_end": string,"p_due_at": string,"p_now": string,"p_state": string }; Returns: boolean
                           },
"postpone_reviews":
{ Args: { "p_card_ids": (string)[],"p_idempotency_key": string,"p_path_id": string }; Returns: Json
                           },
"progress_answer_day":
{ Args: { "p_client_at": string,"p_created_at": string,"p_user": string }; Returns: string
                           },
"progress_bump":
{ Args: { "p_active_ms": number,"p_answers": number,"p_correct_first": number,"p_day": string,"p_lessons": number,"p_path": string,"p_reviews": number,"p_user": string,"p_xp": number }; Returns: undefined
                           },
"progress_day_active":
{ Args: { "p_active_ms": number,"p_lessons": number,"p_reviews": number }; Returns: boolean
                           },
"progress_local_day":
{ Args: { "p_at": string,"p_user": string }; Returns: string
                           },
"progress_prompt_text":
{ Args: { "p_prompt": Json,"p_type": string }; Returns: string
                           },
"progress_run_xp":
{ Args: { "p_run_id": string }; Returns: number
                           },
"progress_streak":
{ Args: { "p_path": string,"p_user": string }; Returns: {
              "best": number,"current": number,"grace_left": number
            }[]
                           },
"purge_analytics":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"purge_expired_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"purge_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reminders_backoff_allows":
{ Args: { "p_isodow": number,"p_level": number }; Returns: boolean
                           },
"reminders_day_active":
{ Args: { "p_day": string,"p_user": string }; Returns: boolean
                           },
"reminders_in_quiet":
{ Args: { "p_end": string,"p_local": string,"p_start": string }; Returns: boolean
                           },
"reminders_prefs_json":
{ Args: { "p_user": string }; Returns: Json
                           },
"reminders_push_text":
{ Args: { "p_kind": string }; Returns: (string)[]
                           },
"reminders_skill_vi":
{ Args: { "p_skill": string }; Returns: string
                           },
"reminders_slot":
{ Args: { "p_local": string,"p_remind_at": string,"p_slots": number }; Returns: {
              "elapsed_seconds": number,"reminder_day": string,"slot": number
            }[]
                           },
"reminders_weekly_body":
{ Args: { "p_payload": Json }; Returns: string
                           },
"reminders_weekly_payload":
{ Args: { "p_user": string,"p_week_end": string }; Returns: Json
                           },
"rename_personal_list":
{ Args: { "p_list_id": string,"p_name": string }; Returns: Json
                           },
"reorder_session":
{ Args: { "p_order": (string)[],"p_session_id": string }; Returns: Json
                           },
"report_content":
{ Args: { "p_note"?: string,"p_reason": string,"p_target_id": string,"p_target_kind": string }; Returns: Json
                           },
"review_day_totals":
{ Args: { "p_extra": boolean,"p_now": string,"p_path_id": string,"p_user": string,"p_weekly_minutes": (number)[] }; Returns: Json
                           },
"review_path_for_user":
{ Args: { "p_path_id": string,"p_require_active": boolean,"p_user": string }; Returns: {
              "created_at": string,
"current_level": string,
"estimate": NonNullable<Json>,
"goal_type": string,
"id": string,
"language_code": string,
"start_point": string,
"status": string,
"target_date": string | null,
"target_level": string,
"updated_at": string,
"user_id": string,
"weekly_minutes": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "learning_paths"
        isOneToOne: true
        isSetofReturn: false
      } },
"review_summary":
{ Args: { "p_path_id": string }; Returns: Json
                           },
"save_exam_answer":
{ Args: { "p_answer": string,"p_attempt_id": string,"p_flagged": boolean,"p_idempotency_key": string,"p_question_id": string }; Returns: Json
                           },
"save_lesson_cursor":
{ Args: { "p_cursor": number,"p_run_id": string }; Returns: undefined
                           },
"save_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: undefined
                           },
"save_session_plan":
{ Args: { "p_path_id": string,"p_plan": Json,"p_replace": boolean }; Returns: Json
                           },
"session_answer_text":
{ Args: { "p_prompt": Json,"p_response": Json,"p_type": string }; Returns: string
                           },
"session_json_int":
{ Args: { "p": Json,"p_max": number,"p_min": number }; Returns: boolean
                           },
"session_json_text":
{ Args: { "p": Json,"p_max": number,"p_min": number }; Returns: boolean
                           },
"session_plan_normalize":
{ Args: { "p_path_id": string,"p_plan": Json }; Returns: Json
                           },
"session_prompt_text":
{ Args: { "p_prompt": Json,"p_type": string }; Returns: string
                           },
"session_recap":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"session_seconds_on":
{ Args: { "p_date": string,"p_path_id": string,"p_user": string }; Returns: number
                           },
"set_current_learning_path":
{ Args: { "p_id": string }; Returns: undefined
                           },
"set_learning_path_status":
{ Args: { "p_id": string,"p_status": string }; Returns: {
              "created_at": string,
"current_level": string,
"estimate": NonNullable<Json>,
"goal_type": string,
"id": string,
"language_code": string,
"start_point": string,
"status": string,
"target_date": string | null,
"target_level": string,
"updated_at": string,
"user_id": string,
"weekly_minutes": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "learning_paths"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_notification_prefs":
{ Args: { "p": Json }; Returns: Json
                           },
"skip_diagnostic_skill":
{ Args: { "p_attempt_id": string,"p_reason": string,"p_skill": string }; Returns: Json
                           },
"srs_adjust_rating":
{ Args: { "p_confidence": number,"p_hint_count": number,"p_rating": number }; Returns: number
                           },
"srs_card_state_json":
{ Args: { "p_difficulty": number,"p_due_at": string,"p_lapses": number,"p_last_review_at": string,"p_reps": number,"p_scheduled_days": number,"p_stability": number,"p_state": string,"p_step": number }; Returns: Json
                           },
"srs_clip_weights":
{ Args: { "p_num_relearning_steps": number,"p_w": (number)[] }; Returns: (number)[]
                           },
"srs_decay_factor":
{ Args: { "p_w": (number)[] }; Returns: (number)[]
                           },
"srs_enroll_lesson":
{ Args: { "p_lesson": string,"p_path": string,"p_user": string }; Returns: number
                           },
"srs_forgetting_curve":
{ Args: { "p_elapsed_days": number,"p_stability": number,"p_w": (number)[] }; Returns: number
                           },
"srs_init_difficulty":
{ Args: { "p_g": number,"p_w": (number)[] }; Returns: number
                           },
"srs_interval_days":
{ Args: { "p_desired_retention": number,"p_maximum_interval": number,"p_stability": number,"p_w": (number)[] }; Returns: number
                           },
"srs_next":
{ Args: { "p_difficulty": number,"p_last_review_at": string,"p_now": string,"p_rating": number,"p_stability": number,"p_state": string,"p_step": number,"p_tz": string }; Returns: Json
                           },
"srs_next_memory":
{ Args: { "p_d": number,"p_g": number,"p_r": number,"p_s": number,"p_t": number,"p_w": (number)[] }; Returns: (number)[]
                           },
"srs_previews":
{ Args: { "p_difficulty": number,"p_last_review_at": string,"p_now": string,"p_stability": number,"p_state": string,"p_step": number,"p_tz": string }; Returns: Json
                           },
"srs_retrievability":
{ Args: { "p_elapsed_days": number,"p_stability": number }; Returns: number
                           },
"srs_round8":
{ Args: { "p_x": number }; Returns: number
                           },
"srs_schedule":
{ Args: { "p_desired_retention": number,"p_difficulty": number,"p_elapsed_days": number,"p_learning_steps": (number)[],"p_maximum_interval": number,"p_rating": number,"p_relearning_steps": (number)[],"p_stability": number,"p_state": string,"p_step": number,"p_w": (number)[] }; Returns: Json
                           },
"srs_step_info":
{ Args: { "p_g": number,"p_learning_steps": (number)[],"p_relearning_steps": (number)[],"p_state": string,"p_step": number }; Returns: (number)[]
                           },
"srs_update_mastery":
{ Args: { "p_item": string,"p_path": string,"p_user": string }; Returns: boolean
                           },
"staff_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"start_diagnostic":
{ Args: { "p_mode"?: string,"p_path_id": string }; Returns: Json
                           },
"start_exam":
{ Args: { "p_form_id": string,"p_mode": string,"p_path_id": string,"p_question_type"?: string,"p_section"?: string }; Returns: Json
                           },
"start_lesson":
{ Args: { "p_client_at"?: string,"p_lesson_id": string,"p_path_id": string,"p_run_id"?: string }; Returns: Json
                           },
"study_session_json":
{ Args: { "p_id": string }; Returns: Json
                           },
"submit_exam":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"submit_exercise":
{ Args: { "p_client_at": string,"p_confidence": number,"p_exercise_id": string,"p_exercise_version": number,"p_hint_count": number,"p_idempotency_key": string,"p_response": Json,"p_response_ms": number,"p_run_id": string }; Returns: Json
                           },
"teacher_active_invites":
{ Args: { "p_class_id": string }; Returns: Json
                           },
"teacher_archive_class":
{ Args: { "p_archived": boolean,"p_class_id": string }; Returns: Json
                           },
"teacher_assignment_done_at":
{ Args: { "p_a": Omit<Database["public"]['Tables']["assignments"]['Row'], Database["public"]['Tables']["assignments"]['ComputedFields']>,"p_language": string,"p_user": string }; Returns: string
                           },
"teacher_assignment_json":
{ Args: { "p_a": Omit<Database["public"]['Tables']["assignments"]['Row'], Database["public"]['Tables']["assignments"]['ComputedFields']> }; Returns: Json
                           },
"teacher_assignment_title":
{ Args: { "p_a": Omit<Database["public"]['Tables']["assignments"]['Row'], Database["public"]['Tables']["assignments"]['ComputedFields']> }; Returns: string
                           },
"teacher_class_for":
{ Args: { "p_active": boolean,"p_class_id": string,"p_teacher": string }; Returns: {
              "archived_at": string | null,
"created_at": string,
"id": string,
"language_code": string,
"name": string,
"teacher_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "classes"
        isOneToOne: true
        isSetofReturn: false
      } },
"teacher_class_json":
{ Args: { "p_class": Omit<Database["public"]['Tables']["classes"]['Row'], Database["public"]['Tables']["classes"]['ComputedFields']> }; Returns: Json
                           },
"teacher_class_roster":
{ Args: { "p_class_id": string }; Returns: Json
                           },
"teacher_create_assignment":
{ Args: { "p_class_id": string,"p_due_at"?: string,"p_kind": string,"p_note"?: string,"p_ref_id"?: string,"p_target_count"?: number }; Returns: Json
                           },
"teacher_create_class":
{ Args: { "p_language": string,"p_name": string }; Returns: Json
                           },
"teacher_create_invite":
{ Args: { "p_class_id": string,"p_expires_hours"?: number,"p_max_uses"?: number }; Returns: Json
                           },
"teacher_delete_assignment":
{ Args: { "p_assignment_id": string }; Returns: Json
                           },
"teacher_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"teacher_list_classes":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"teacher_member_path":
{ Args: { "p_language": string,"p_user": string }; Returns: string
                           },
"teacher_member_stats":
{ Args: { "p_class": Omit<Database["public"]['Tables']["classes"]['Row'], Database["public"]['Tables']["classes"]['ComputedFields']>,"p_user": string }; Returns: Json
                           },
"teacher_normalize_code":
{ Args: { "p_code": string }; Returns: string
                           },
"teacher_remove_member":
{ Args: { "p_class_id": string,"p_user_id": string }; Returns: Json
                           },
"teacher_rename_class":
{ Args: { "p_class_id": string,"p_name": string }; Returns: Json
                           },
"teacher_require":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"teacher_reviews_since":
{ Args: { "p_language": string,"p_since": string,"p_user": string }; Returns: number
                           },
"teacher_revoke_invite":
{ Args: { "p_code": string }; Returns: Json
                           },
"track_events":
{ Args: { "p_events": Json }; Returns: number
                           },
"unread_notification_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"update_learning_path_plan":
{ Args: { "p_goal_type": string,"p_id": string,"p_target_date"?: string,"p_target_level": string,"p_weekly_minutes": (number)[] }; Returns: {
              "created_at": string,
"current_level": string,
"estimate": NonNullable<Json>,
"goal_type": string,
"id": string,
"language_code": string,
"start_point": string,
"status": string,
"target_date": string | null,
"target_level": string,
"updated_at": string,
"user_id": string,
"weekly_minutes": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "learning_paths"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_personal_word":
{ Args: { "p_example": string,"p_meaning": string,"p_note": string,"p_pronunciation": string,"p_term": string,"p_word_id": string }; Returns: Json
                           },
"update_session_item":
{ Args: { "p_item_id": string,"p_seconds": number,"p_session_id": string,"p_status": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
