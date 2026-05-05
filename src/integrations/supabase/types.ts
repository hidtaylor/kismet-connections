export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      calendar_imports: {
        Row: {
          attendees: Json
          calendar_id: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          external_id: string
          hangout_link: string | null
          id: string
          interaction_id: string | null
          location: string | null
          organizer_email: string | null
          provider: string
          raw: Json | null
          starts_at: string
          status: Database["public"]["Enums"]["import_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json
          calendar_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          external_id: string
          hangout_link?: string | null
          id?: string
          interaction_id?: string | null
          location?: string | null
          organizer_email?: string | null
          provider?: string
          raw?: Json | null
          starts_at: string
          status?: Database["public"]["Enums"]["import_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json
          calendar_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          external_id?: string
          hangout_link?: string | null
          id?: string
          interaction_id?: string | null
          location?: string | null
          organizer_email?: string | null
          provider?: string
          raw?: Json | null
          starts_at?: string
          status?: Database["public"]["Enums"]["import_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      card_scans: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          image_url: string
          ocr_json: Json | null
          parsed_json: Json | null
          status: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          image_url: string
          ocr_json?: Json | null
          parsed_json?: Json | null
          status?: Database["public"]["Enums"]["scan_status"]
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          image_url?: string
          ocr_json?: Json | null
          parsed_json?: Json | null
          status?: Database["public"]["Enums"]["scan_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_scans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_scans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          last_polled_at: string | null
          name: string
          news_feed_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          last_polled_at?: string | null
          name: string
          news_feed_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          last_polled_at?: string | null
          name?: string
          news_feed_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_events: {
        Row: {
          acted_on_at: string | null
          after_value: string | null
          before_value: string | null
          company_id: string
          detected_at: string
          dismissed_at: string | null
          event_type: string
          id: string
          source_label: string | null
          title: string | null
          url: string | null
          url_normalized: string | null
          user_id: string
        }
        Insert: {
          acted_on_at?: string | null
          after_value?: string | null
          before_value?: string | null
          company_id: string
          detected_at?: string
          dismissed_at?: string | null
          event_type: string
          id?: string
          source_label?: string | null
          title?: string | null
          url?: string | null
          url_normalized?: string | null
          user_id: string
        }
        Update: {
          acted_on_at?: string | null
          after_value?: string | null
          before_value?: string | null
          company_id?: string
          detected_at?: string
          dismissed_at?: string | null
          event_type?: string
          id?: string
          source_label?: string | null
          title?: string | null
          url?: string | null
          url_normalized?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      company_field_sources: {
        Row: {
          company_id: string
          confidence: number
          fetched_at: string
          field_name: string
          is_active: boolean
          source: string
          user_id: string
          value: string | null
        }
        Insert: {
          company_id: string
          confidence: number
          fetched_at?: string
          field_name: string
          is_active?: boolean
          source: string
          user_id: string
          value?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number
          fetched_at?: string
          field_name?: string
          is_active?: boolean
          source?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_field_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_field_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_aliases: {
        Row: {
          alias_type: string
          alias_value: string
          contact_id: string
          fetched_at: string
          source: string
          user_id: string
        }
        Insert: {
          alias_type: string
          alias_value: string
          contact_id: string
          fetched_at?: string
          source: string
          user_id: string
        }
        Update: {
          alias_type?: string
          alias_value?: string
          contact_id?: string
          fetched_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_aliases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_aliases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_edges: {
        Row: {
          detected_at: string | null
          edge_type: string
          evidence: Json
          from_contact: string
          strength: number
          to_contact: string
          user_id: string
        }
        Insert: {
          detected_at?: string | null
          edge_type: string
          evidence: Json
          from_contact: string
          strength: number
          to_contact: string
          user_id: string
        }
        Update: {
          detected_at?: string | null
          edge_type?: string
          evidence?: Json
          from_contact?: string
          strength?: number
          to_contact?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_edges_from_contact_fkey"
            columns: ["from_contact"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_edges_from_contact_fkey"
            columns: ["from_contact"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_edges_to_contact_fkey"
            columns: ["to_contact"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_edges_to_contact_fkey"
            columns: ["to_contact"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_events: {
        Row: {
          acted_on_at: string | null
          after_value: string | null
          before_value: string | null
          contact_id: string
          detected_at: string
          dismissed_at: string | null
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          acted_on_at?: string | null
          after_value?: string | null
          before_value?: string | null
          contact_id: string
          detected_at?: string
          dismissed_at?: string | null
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          acted_on_at?: string | null
          after_value?: string | null
          before_value?: string | null
          contact_id?: string
          detected_at?: string
          dismissed_at?: string | null
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_field_sources: {
        Row: {
          confidence: number
          contact_id: string
          fetched_at: string
          field_name: string
          is_active: boolean
          source: string
          user_id: string
          value: string | null
        }
        Insert: {
          confidence: number
          contact_id: string
          fetched_at?: string
          field_name: string
          is_active?: boolean
          source: string
          user_id: string
          value?: string | null
        }
        Update: {
          confidence?: number
          contact_id?: string
          fetched_at?: string
          field_name?: string
          is_active?: boolean
          source?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_sources_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_sources_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          cadence: Database["public"]["Enums"]["cadence_type"]
          company: string | null
          company_id: string | null
          created_at: string
          emails: Json
          first_name: string | null
          full_name: string
          id: string
          last_contact_at: string | null
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          notes_summary: string | null
          organization_id: string | null
          phones: Json
          photo_url: string | null
          source: Database["public"]["Enums"]["contact_source"]
          title: string | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["cadence_type"]
          company?: string | null
          company_id?: string | null
          created_at?: string
          emails?: Json
          first_name?: string | null
          full_name: string
          id?: string
          last_contact_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          notes_summary?: string | null
          organization_id?: string | null
          phones?: Json
          photo_url?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          cadence?: Database["public"]["Enums"]["cadence_type"]
          company?: string | null
          company_id?: string | null
          created_at?: string
          emails?: Json
          first_name?: string | null
          full_name?: string
          id?: string
          last_contact_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          notes_summary?: string | null
          organization_id?: string | null
          phones?: Json
          photo_url?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          source_id: string
          source_type: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          source_id: string
          source_type: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          source_id?: string
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      enrichment_jobs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          cost_cents: number | null
          created_at: string | null
          error_message: string | null
          id: string
          match_key: string
          provider: string
          raw_response: Json | null
          request_hash: string
          status: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          cost_cents?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          match_key: string
          provider: string
          raw_response?: Json | null
          request_hash: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          cost_cents?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          match_key?: string
          provider?: string
          raw_response?: Json | null
          request_hash?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          ends_at: string | null
          host_org_id: string | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          location: string | null
          name: string
          notes: string | null
          starts_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          host_org_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          name: string
          notes?: string | null
          starts_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          host_org_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          name?: string
          notes?: string | null
          starts_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_edges: {
        Row: {
          confidence: Database["public"]["Enums"]["edge_confidence"]
          created_at: string
          evidence: Json
          first_seen_at: string
          id: string
          kind: Database["public"]["Enums"]["edge_kind"]
          last_seen_at: string
          source_node_id: string
          strength_override: number | null
          strength_score: number
          target_node_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["edge_confidence"]
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          id?: string
          kind: Database["public"]["Enums"]["edge_kind"]
          last_seen_at?: string
          source_node_id: string
          strength_override?: number | null
          strength_score?: number
          target_node_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["edge_confidence"]
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["edge_kind"]
          last_seen_at?: string
          source_node_id?: string
          strength_override?: number | null
          strength_score?: number
          target_node_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_nodes: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["node_kind"]
          label: string
          ref_id: string
          ref_table: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["node_kind"]
          label: string
          ref_id: string
          ref_table: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["node_kind"]
          label?: string
          ref_id?: string
          ref_table?: string
          user_id?: string
        }
        Relationships: []
      }
      interaction_contacts: {
        Row: {
          contact_id: string
          interaction_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          interaction_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          interaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_contacts_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          location: string | null
          occurred_at: string
          source_external_id: string | null
          source_provider: string | null
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["interaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          source_external_id?: string | null
          source_provider?: string | null
          summary?: string | null
          title: string
          type?: Database["public"]["Enums"]["interaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          source_external_id?: string | null
          source_provider?: string | null
          summary?: string | null
          title?: string
          type?: Database["public"]["Enums"]["interaction_type"]
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          body_md: string
          confirmed_at: string | null
          contact_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          interaction_id: string | null
          provenance: Database["public"]["Enums"]["note_provenance"]
          sensitivity: Database["public"]["Enums"]["note_sensitivity"]
          source_interaction_id: string | null
          transcript: string | null
          user_id: string
          voice_url: string | null
        }
        Insert: {
          body_md?: string
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          interaction_id?: string | null
          provenance?: Database["public"]["Enums"]["note_provenance"]
          sensitivity?: Database["public"]["Enums"]["note_sensitivity"]
          source_interaction_id?: string | null
          transcript?: string | null
          user_id: string
          voice_url?: string | null
        }
        Update: {
          body_md?: string
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          interaction_id?: string | null
          provenance?: Database["public"]["Enums"]["note_provenance"]
          sensitivity?: Database["public"]["Enums"]["note_sensitivity"]
          source_interaction_id?: string | null
          transcript?: string | null
          user_id?: string
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["org_kind"]
          logo_url: string | null
          name: string
          notes: string | null
          parent_org_id: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          logo_url?: string | null
          name: string
          notes?: string | null
          parent_org_id?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          logo_url?: string | null
          name?: string
          notes?: string | null
          parent_org_id?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          audio_retention_days: number
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_retention_days?: number
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_retention_days?: number
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          consent_disclosed: boolean
          created_at: string
          duration_seconds: number | null
          external_url: string | null
          id: string
          interaction_id: string | null
          source_external_id: string | null
          source_provider: string | null
          storage_path: string | null
          transcript_status: Database["public"]["Enums"]["transcript_status"]
          transcript_text: string | null
          user_id: string
        }
        Insert: {
          consent_disclosed?: boolean
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          id?: string
          interaction_id?: string | null
          source_external_id?: string | null
          source_provider?: string | null
          storage_path?: string | null
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          transcript_text?: string | null
          user_id: string
        }
        Update: {
          consent_disclosed?: boolean
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          id?: string
          interaction_id?: string | null
          source_external_id?: string | null
          source_provider?: string | null
          storage_path?: string | null
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          transcript_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_memories: {
        Row: {
          body_md: string
          contact_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          reasoning: string | null
          source_interaction_id: string | null
          status: Database["public"]["Enums"]["suggested_memory_status"]
          suggested_provenance: Database["public"]["Enums"]["note_provenance"]
          suggested_sensitivity: Database["public"]["Enums"]["note_sensitivity"]
          user_id: string
        }
        Insert: {
          body_md: string
          contact_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          reasoning?: string | null
          source_interaction_id?: string | null
          status?: Database["public"]["Enums"]["suggested_memory_status"]
          suggested_provenance?: Database["public"]["Enums"]["note_provenance"]
          suggested_sensitivity?: Database["public"]["Enums"]["note_sensitivity"]
          user_id: string
        }
        Update: {
          body_md?: string
          contact_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          reasoning?: string | null
          source_interaction_id?: string | null
          status?: Database["public"]["Enums"]["suggested_memory_status"]
          suggested_provenance?: Database["public"]["Enums"]["note_provenance"]
          suggested_sensitivity?: Database["public"]["Enums"]["note_sensitivity"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_memories_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_memories_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_memories_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          backfill_done_at: string | null
          created_at: string
          cursor: string | null
          id: string
          last_synced_at: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backfill_done_at?: string | null
          created_at?: string
          cursor?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backfill_done_at?: string | null
          created_at?: string
          cursor?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      companies_resolved: {
        Row: {
          created_at: string | null
          description: string | null
          domain: string | null
          employee_count: string | null
          funding_stage: string | null
          id: string | null
          industry: string | null
          last_funding_amount: string | null
          last_polled_at: string | null
          location: string | null
          name: string | null
          news_feed_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: never
          domain?: string | null
          employee_count?: never
          funding_stage?: never
          id?: string | null
          industry?: never
          last_funding_amount?: never
          last_polled_at?: string | null
          location?: never
          name?: string | null
          news_feed_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: never
          domain?: string | null
          employee_count?: never
          funding_stage?: never
          id?: string | null
          industry?: never
          last_funding_amount?: never
          last_polled_at?: string | null
          location?: never
          name?: string | null
          news_feed_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contacts_resolved: {
        Row: {
          cadence: Database["public"]["Enums"]["cadence_type"] | null
          company: string | null
          company_id: string | null
          created_at: string | null
          email: string | null
          emails: Json | null
          first_name: string | null
          full_name: string | null
          id: string | null
          last_contact_at: string | null
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          notes_summary: string | null
          organization_id: string | null
          phone: string | null
          phones: Json | null
          photo_url: string | null
          source: Database["public"]["Enums"]["contact_source"] | null
          title: string | null
          twitter_url: string | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["cadence_type"] | null
          company?: never
          company_id?: string | null
          created_at?: string | null
          email?: never
          emails?: Json | null
          first_name?: never
          full_name?: never
          id?: string | null
          last_contact_at?: string | null
          last_name?: never
          linkedin_url?: never
          location?: never
          notes_summary?: string | null
          organization_id?: string | null
          phone?: never
          phones?: Json | null
          photo_url?: never
          source?: Database["public"]["Enums"]["contact_source"] | null
          title?: never
          twitter_url?: never
          updated_at?: string | null
          user_id?: string | null
          website_url?: never
        }
        Update: {
          cadence?: Database["public"]["Enums"]["cadence_type"] | null
          company?: never
          company_id?: string | null
          created_at?: string | null
          email?: never
          emails?: Json | null
          first_name?: never
          full_name?: never
          id?: string | null
          last_contact_at?: string | null
          last_name?: never
          linkedin_url?: never
          location?: never
          notes_summary?: string | null
          organization_id?: string | null
          phone?: never
          phones?: Json | null
          photo_url?: never
          source?: Database["public"]["Enums"]["contact_source"] | null
          title?: never
          twitter_url?: never
          updated_at?: string | null
          user_id?: string | null
          website_url?: never
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_resolved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_active_company_value: {
        Args: { p_company_id: string; p_field_name: string }
        Returns: string
      }
      get_active_contact_value: {
        Args: { p_contact_id: string; p_field_name: string }
        Returns: string
      }
      recompute_company_field_activation: {
        Args: { p_company_id: string; p_field_name: string }
        Returns: undefined
      }
      recompute_field_activation: {
        Args: { p_contact_id: string; p_field_name: string }
        Returns: undefined
      }
      recompute_graph_strength: {
        Args: { p_user_id: string }
        Returns: {
          edges_scored: number
          max_raw: number
          max_score: number
          orgs_scored: number
          pairs_computed: number
        }[]
      }
      update_contact_with_provenance: {
        Args: {
          p_confidence?: number
          p_contact_id: string
          p_fields: Json
          p_source?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      cadence_type: "close" | "monthly" | "quarterly" | "annual" | "none"
      contact_source: "card_scan" | "calendar" | "email" | "manual"
      edge_confidence: "confirmed" | "inferred" | "suggested"
      edge_kind:
        | "knows"
        | "worked_with"
        | "introduced_by"
        | "family"
        | "mentor"
        | "mentee"
        | "works_at"
        | "formerly_at"
        | "advisor"
        | "board"
        | "founder"
        | "client"
        | "attended"
        | "spoke_at"
        | "hosted"
        | "expert_in"
        | "interested_in"
        | "parent_of"
        | "subsidiary_of"
        | "partner_of"
        | "competitor_of"
        | "sponsored"
        | "co_attended"
        | "met_with"
        | "co_thread"
      event_kind:
        | "conference"
        | "panel"
        | "dinner"
        | "internal"
        | "webinar"
        | "other"
      import_status: "pending" | "approved" | "rejected"
      interaction_type:
        | "in_person"
        | "call"
        | "video"
        | "email"
        | "conference"
        | "other"
      node_kind: "person" | "org" | "event" | "topic"
      note_provenance:
        | "fact"
        | "user_memory"
        | "ai_summary"
        | "ai_inference"
        | "recommendation"
      note_sensitivity: "normal" | "sensitive" | "private"
      org_kind:
        | "brokerage"
        | "association"
        | "vendor"
        | "portal"
        | "mls"
        | "startup"
        | "other"
      scan_status: "pending" | "parsed" | "confirmed" | "discarded"
      suggested_memory_status: "pending" | "accepted" | "rejected"
      transcript_status: "pending" | "processing" | "done" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cadence_type: ["close", "monthly", "quarterly", "annual", "none"],
      contact_source: ["card_scan", "calendar", "email", "manual"],
      edge_confidence: ["confirmed", "inferred", "suggested"],
      edge_kind: [
        "knows",
        "worked_with",
        "introduced_by",
        "family",
        "mentor",
        "mentee",
        "works_at",
        "formerly_at",
        "advisor",
        "board",
        "founder",
        "client",
        "attended",
        "spoke_at",
        "hosted",
        "expert_in",
        "interested_in",
        "parent_of",
        "subsidiary_of",
        "partner_of",
        "competitor_of",
        "sponsored",
        "co_attended",
        "met_with",
        "co_thread",
      ],
      event_kind: [
        "conference",
        "panel",
        "dinner",
        "internal",
        "webinar",
        "other",
      ],
      import_status: ["pending", "approved", "rejected"],
      interaction_type: [
        "in_person",
        "call",
        "video",
        "email",
        "conference",
        "other",
      ],
      node_kind: ["person", "org", "event", "topic"],
      note_provenance: [
        "fact",
        "user_memory",
        "ai_summary",
        "ai_inference",
        "recommendation",
      ],
      note_sensitivity: ["normal", "sensitive", "private"],
      org_kind: [
        "brokerage",
        "association",
        "vendor",
        "portal",
        "mls",
        "startup",
        "other",
      ],
      scan_status: ["pending", "parsed", "confirmed", "discarded"],
      suggested_memory_status: ["pending", "accepted", "rejected"],
      transcript_status: ["pending", "processing", "done", "failed"],
    },
  },
} as const
