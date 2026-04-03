// === Sync fields (added to all syncable entities) ===
// pb_id: PocketBase record ID (empty until synced)
// owner_id: PocketBase user ID who owns this record
// _dirty: marks records with local changes not yet pushed
// _deleted: soft delete for sync (push delete to PB when online)

// Contact for a job (client, builder, VVS, electrician, etc.)
export interface JobContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: string;
}

// Global address-book contact (auto-saved from jobs)
export interface SavedContact {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  name: string;
  phone?: string;
  email?: string;
  role: string;
  addresses: string[];  // addresses this contact has been associated with
  created_at: number;
  updated_at: number;
}

// Job types
export interface Job {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  name: string;
  address: string;
  description: string;
  contacts?: JobContact[];
  lat?: number;
  lon?: number;
  status: 'active' | 'completed' | 'archived';
  _shared?: boolean;
  _share_role?: 'viewer' | 'editor';
  created_at: number;
  updated_at: number;
}

// Task types
export interface Task {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
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
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  job_id: string;
  task_id?: string;
  image_data: Blob;
  image_url?: string; // PB file URL for shared/synced photos
  image_hash?: string;
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

// Knowledge base entry — cached AI answers for reuse
export interface KnowledgeEntry {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  question: string;
  keywords: string[];
  answer: string;
  category: string;  // e.g. 'standards', 'wiring', 'safety', 'tools', 'general'
  source: 'seed' | 'ai';  // pre-seeded or learned from AI chat
  useCount: number;
  created_at: number;
  updated_at: number;
}

// Shopping list item per job
export interface ShoppingItem {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  job_id: string;
  name: string;
  e_number?: string;       // E-nummer from catalog
  article_number?: string; // Manufacturer article number
  manufacturer?: string;
  category?: string;       // Product category for grouping (e.g. 'Kanaler', 'Uttag', 'Strömställare')
  quantity: number;
  unit: string;            // 'st', 'm', 'paket', etc.
  checked: boolean;        // bought/collected
  parent_item_id?: string; // If set, this is an accessory/sub-item
  created_at: number;
}

// Chat message for per-job AI conversation
export interface ChatMessage {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  job_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

// Panel schedule (gruppförteckning)
export interface PanelScheduleRow {
  id: string;
  group_number: number;       // Grupp nr
  description: string;        // Gruppen omfattar
  module_number: string;      // Modul nr
  rated_current: string;      // Märkström A (e.g. "10", "16", "20")
  conductor_size: string;     // Ledarantal/mått (e.g. "3G1.5", "3G2.5", "5G2.5")
}

export interface PanelSchedule {
  id: string;
  pb_id?: string;
  owner_id?: string;
  _dirty?: boolean;
  _deleted?: boolean;
  job_id: string;
  name: string;
  rows: PanelScheduleRow[];
  fault_contact: string;      // "Vid fel ring:" info
  source_photo_id?: string;
  created_at: number;
  updated_at: number;
}

// Job sharing
export interface JobShare {
  id: string;
  pb_id?: string;
  job_id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  role: 'viewer' | 'editor';
  created_at: number;
}

// Sync metadata per collection
export interface SyncMeta {
  collection: string;
  last_synced_at: number;
}

// Sync queue item
export interface SyncQueueItem {
  id: string;
  collection: string;
  local_id: string;
  action: 'create' | 'update' | 'delete';
  created_at: number;
  retries: number;
}

// API Key storage + sync settings
export interface AppSettings {
  claude_api_key?: string;
  language?: 'en' | 'sv';
  theme?: 'light' | 'dark' | 'system';
  company_name?: string;
  company_logo?: string;     // base64 data URL
  company_website?: string;
  // PocketBase sync settings
  pocketbase_url?: string;
  pb_auth_token?: string;
  pb_user_id?: string;
  pb_user_email?: string;
  pb_user_name?: string;
  last_updated: number;
}
