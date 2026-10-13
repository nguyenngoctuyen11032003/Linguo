
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "learning_paths": {
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
                },"user_preferences": {
                  Row: {
                    "reduce_motion": boolean,"theme": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "reduce_motion"?: boolean,"theme"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "reduce_motion"?: boolean,"theme"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
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
"estimate_learning_path":
{ Args: { "p_current_level": string,"p_language": string,"p_target_date": string,"p_target_level": string,"p_today": string,"p_weekly_minutes": (number)[] }; Returns: Json
                           },
"learning_path_validate":
{ Args: { "p_current_level": string,"p_goal_type": string,"p_language": string,"p_target_date": string,"p_target_level": string,"p_today": string,"p_weekly_minutes": (number)[] }; Returns: undefined
                           },
"learning_user_today":
{ Args: { "p_user": string }; Returns: string
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
