// Job types
export interface Job {
  id: string;
  name: string;
  address: string;
  description: string;
  status: 'active' | 'completed' | 'archived';
  created_at: number;
  updated_at: number;
}

// Task types
export interface Task {
  id: string;
  job_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  notes: string;
  source_photo_id?: string;
  parent_task_id?: string;
  created_at: number;
  updated_at: number;
}

// Photo types
export interface Photo {
  id: string;
  job_id: string;
  task_id?: string;
  image_data: Blob;
  extracted_info?: ElectricalPanelInfo;
  user_notes: string;
  created_at: number;
}

// Electrical analysis result (panels, wiring, outlets, switches, etc.)
export interface ElectricalPanelInfo {
  component_type?: string;       // e.g. "panel", "outlet", "wiring", "junction box", "switch"
  manufacturer?: string;
  model?: string;
  voltage?: string;
  amperage?: string;
  circuits?: number;
  compliance_marks?: string[];
  condition?: string;
  location_notes?: string;       // what part of the installation this shows
  recommendations?: string[];
  raw_analysis?: string;
}

// API Key storage
export interface AppSettings {
  claude_api_key?: string;
  language?: 'en' | 'sv';
  theme?: 'light' | 'dark' | 'system';
  last_updated: number;
}
