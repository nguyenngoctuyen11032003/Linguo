
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_cache": {
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
                    "count": number,"refunded": number,"used_on": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"refunded"?: number,"used_on": string,"user_id": string
                  }
                  Update: {
                    "count"?: number,"refunded"?: number,"used_on"?: string,"user_id"?: string
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
isOneToOne: false
      referencedRelation: "ai_usage"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "attempts": number,"cached": boolean,"created_at": string,"http_status": number,"id": string,"input_chars": number,"latency_ms": number,"model": string,"prompt_version": string,"repaired": boolean,"status": string,"task": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"cached"?: boolean,"created_at"?: string,"http_status": number,"id"?: string,"input_chars"?: number,"latency_ms"?: number,"model": string,"prompt_version": string,"repaired"?: boolean,"status": string,"task": string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"cached"?: boolean,"created_at"?: string,"http_status"?: number,"id"?: string,"input_chars"?: number,"latency_ms"?: number,"model"?: string,"prompt_version"?: string,"repaired"?: boolean,"status"?: string,"task"?: string,"user_id"?: string
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
                },"profiles": {
                  Row: {
                    "created_at": string,"current_learning_path_id": string | null,"display_name": string | null,"id": string,"locale": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_learning_path_id"?: string | null,"display_name"?: string | null,"id": string,"locale"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_learning_path_id"?: string | null,"display_name"?: string | null,"id"?: string,"locale"?: string,"timezone"?: string,"updated_at"?: string
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
                },"user_preferences": {
                  Row: {
                    "ai_notice_ack_at": string | null,"reduce_motion": boolean,"theme": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_notice_ack_at"?: string | null,"reduce_motion"?: boolean,"theme"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_notice_ack_at"?: string | null,"reduce_motion"?: boolean,"theme"?: string,"updated_at"?: string,"user_id"?: string
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
"ack_ai_notice":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ai_cache_get":
{ Args: { "p_key": string }; Returns: Json
                           },
"ai_cache_put":
{ Args: { "p_key": string,"p_model": string,"p_payload": Json,"p_prompt_version": string,"p_task": string }; Returns: undefined
                           },
"ai_quota_consume":
{ Args: { "p_limit": number }; Returns: Json
                           },
"ai_quota_refund":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"ai_quota_status":
{ Args: { "p_limit": number }; Returns: Json
                           },
"ai_report":
{ Args: { "p_note"?: string,"p_reason": string,"p_usage_id": string }; Returns: string
                           },
"ai_usage_log":
{ Args: { "p_attempts": number,"p_cached": boolean,"p_http_status": number,"p_input_chars": number,"p_latency_ms": number,"p_model": string,"p_prompt_version": string,"p_repaired": boolean,"p_status": string,"p_task": string }; Returns: string
                           },
"answer_diagnostic":
{ Args: { "p_attempt_id": string,"p_choice": string,"p_item_id": string }; Returns: Json
                           },
"complete_lesson":
{ Args: { "p_run_id": string }; Returns: Json
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
"finish_diagnostic":
{ Args: { "p_attempt_id": string }; Returns: Json
                           },
"get_lesson":
{ Args: { "p_lesson_id": string,"p_path_id": string }; Returns: Json
                           },
"get_review_queue":
{ Args: { "p_extra"?: boolean,"p_limit"?: number,"p_path_id": string }; Returns: Json
                           },
"grade_exercise":
{ Args: { "p_answer": Json,"p_known_wrong": Json,"p_lang": string,"p_response": Json,"p_rubric": Json,"p_type": string }; Returns: Json
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
"import_content_bundle":
{ Args: { "p_bundle": Json }; Returns: Json
                           },
"import_diagnostic_content_bundle":
{ Args: { "p_bundle": Json }; Returns: Json
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
"path_lessons":
{ Args: { "p_path_id": string }; Returns: {
              "estimated_minutes": number,"is_demo": boolean,"lesson_id": string,"lesson_key": string,"lesson_order": number,"level_code": string,"prerequisite_ids": (string)[],"prerequisites_met": boolean,"program_id": string,"program_title": Json,"run_status": string,"title": Json,"unit_id": string,"unit_order": number,"unit_title": Json
            }[]
                           },
"postpone_reviews":
{ Args: { "p_card_ids": (string)[],"p_idempotency_key": string,"p_path_id": string }; Returns: Json
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
"save_lesson_cursor":
{ Args: { "p_cursor": number,"p_run_id": string }; Returns: undefined
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
"start_diagnostic":
{ Args: { "p_mode"?: string,"p_path_id": string }; Returns: Json
                           },
"start_lesson":
{ Args: { "p_lesson_id": string,"p_path_id": string }; Returns: Json
                           },
"submit_exercise":
{ Args: { "p_client_at": string,"p_confidence": number,"p_exercise_id": string,"p_exercise_version": number,"p_hint_count": number,"p_idempotency_key": string,"p_response": Json,"p_response_ms": number,"p_run_id": string }; Returns: Json
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
      } }
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
