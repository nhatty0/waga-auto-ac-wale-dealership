export interface VehicleImage {
  id: number;
  image_url: string;
  is_cover: boolean;
  display_order: number;
}

export interface Vehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  price?: number | null;
  mileage?: number | null;
  condition: string;
  fuel_type: string;
  transmission: string;
  body_type: string;
  engine_size?: string;
  drive_train?: string;
  exterior_color?: string;
  customs_cleared: boolean;
  features?: string;
  description?: string;
  status: "Available" | "Reserved" | "Sold" | "In Transit";
  created_at: string;
  images: VehicleImage[];

  // Bank Loan Properties
  has_bank_loan?: boolean;
  cash_price?: number | null;
  bank_loan_amount?: number | null;
  bank_name?: string | null;

  // Plate Status
  plate_status?: string | null;

  // Multi-tenant Dealership ID & Scoped Profile
  dealership_id?: number | null;
  dealership?: Dealership | null;

  // 3D and 360 Spin Viewer (Optional)
  model_url?: string | null;
  spin_images?: string[] | null;

  // Compatibility aliases
  down_payment?: number | null;
  bank_loan?: number | null;
  plate_code?: string | null;
}

export interface AppointmentPayload {
  vehicle_id?: number | null;
  dealership_id?: number | null;
  customer_name: string;
  phone_number: string;
  preferred_channel: string;
  appointment_type: "In-Person Test Drive" | "Virtual Video Tour";
  date: string;
  time_slot: string;
  notes?: string;
}

// Added the missing Appointment model returned from the backend
export interface Appointment extends AppointmentPayload {
  id: number;
  dealership_id?: number | null;
  status: string;
  created_at: string;
}

export interface Dealership {
  id: number;
  name: string;
  slug: string;
  phone_number?: string | null;
  logo_url?: string | null;
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
  telegram_bot_username?: string | null;
  is_active?: boolean;
  subscription_plan?: string;
  max_vehicles?: number;
  created_at?: string | null;
}

export interface SuperAdminStats {
  total_dealerships: number;
  total_active_listings: number;
  total_inventory_value: number;
  total_leads_generated: number;
}

export interface SuperAdminDealership {
  id: number;
  name: string;
  slug: string;
  phone_number?: string | null;
  logo_url?: string | null;
  created_at?: string | null;
  subscription_plan: string;
  max_vehicles: number;
  is_active: boolean;
  vehicle_count: number;
  user_phone_number?: string | null;
}

export interface User {
  id: number;
  phone_number: string;
  full_name?: string | null;
  role: string;
  dealership_id?: number | null;
  dealership?: Dealership | null;
  is_active: boolean;
  created_at: string;
}

