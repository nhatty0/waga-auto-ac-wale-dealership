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

  // Car Rental Engine Properties
  listing_type?: "sale" | "rent" | "both";
  rental_daily_rate?: number | null;
  daily_rental_rate?: number | null;
  daily_rate?: number | null;
  rental_available?: boolean;
  with_driver_only?: boolean;

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

export interface Driver {
  id: number;
  full_name: string;
  phone_number: string;
  license_number?: string | null;
  is_active: boolean;
  dealership_id?: number | null;
  created_at?: string;
}

export interface RentalBookingPayload {
  vehicle_id: number;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  delivery_type: "showroom_pickup" | "doorstep_delivery";
  delivery_address?: string | null;
  dealership_id?: number | null;
}

export interface RentalBooking {
  id: number;
  vehicle_id: number;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  total_days: number;
  total_price: number;
  delivery_type: "showroom_pickup" | "doorstep_delivery";
  delivery_address?: string | null;
  assigned_driver_id?: number | null;
  status: "pending" | "confirmed" | "driver_assigned" | "delivered" | "completed" | "cancelled";
  dealership_id?: number | null;
  created_at: string;
  vehicle?: Vehicle | null;
  assigned_driver?: Driver | null;
}

export interface ExecutiveStats {
  sales_count?: number;
  rental_count?: number;
  drivers_count?: number;
  leads_count?: number;
  total_sales_inventory?: number;
  active_rental_fleet?: number;
  registered_drivers?: number;
  total_leads_bookings?: number;
  sales_inventory?: number;
  rental_fleet?: number;
  active_drivers?: number;
  total_inquiries_and_bookings?: number;
  total_sales_inquiries?: number;
  total_rental_bookings?: number;
  total_inventory_value?: number;
  dealership_name?: string;
}

export interface StaffUser {
  id: number;
  phone_number: string;
  full_name?: string | null;
  role: string;
  is_active: boolean;
  dealership_id?: number | null;
  created_at: string;
}

export interface GatePass {
  id: number;
  slip_number: string;
  date: string;
  driver_name: string;
  plate_number: string;
  release_reason: string;
  authorized_by: string;
  lot_intake_id?: number | null;
  dealership_id?: number | null;
  created_at?: string;
}

export interface LotIntake {
  id: number;
  vehicle_name: string;
  year_of_production?: number | null;
  plate_number: string;
  primary_cash_price?: number | null;
  primary_bank_price?: number | null;
  final_cash_price?: number | null;
  final_bank_price?: number | null;
  received_date: string;
  owner_name: string;
  owner_phone: string;
  remark?: string | null;
  received_by_name?: string | null;
  is_in_lot: boolean;
  published_vehicle_id?: number | null;
  dealership_id?: number | null;
  created_at?: string;
  gate_passes?: GatePass[];
}

export interface LotIntakePayload {
  vehicle_name: string;
  year_of_production?: number | null;
  plate_number: string;
  primary_cash_price?: number | null;
  primary_bank_price?: number | null;
  final_cash_price?: number | null;
  final_bank_price?: number | null;
  received_date?: string | null;
  owner_name: string;
  owner_phone: string;
  remark?: string | null;
  received_by_name?: string | null;
  publish_to_showroom?: boolean;
  dealership_id?: number | null;
}

export interface GatePassPayload {
  driver_name: string;
  plate_number?: string | null;
  release_reason: string;
  authorized_by: string;
  slip_number?: string | null;
  date?: string | null;
}

export interface HandoverBelonging {
  item_name: string;
  quantity: string;
}

export interface VehicleHandover {
  id: number;
  contract_number: string;
  date: string;
  owner_full_name: string;
  owner_phone: string;
  owner_subcity?: string | null;
  owner_woreda?: string | null;
  owner_house_no?: string | null;
  vehicle_type: string;
  manufacture_year?: number | null;
  chassis_number?: string | null;
  engine_number?: string | null;
  horsepower?: string | null;
  color?: string | null;
  plate_number: string;
  belongings_json?: string | null;
  agreed_selling_price?: number | null;
  commission_or_net_payout?: string | null;
  vehicle_id?: number | null;
  dealership_id?: number | null;
  created_at?: string;
}

export interface VehicleHandoverPayload {
  contract_number?: string | null;
  date?: string | null;
  owner_full_name: string;
  owner_phone: string;
  owner_subcity?: string | null;
  owner_woreda?: string | null;
  owner_house_no?: string | null;
  vehicle_type: string;
  manufacture_year?: number | null;
  chassis_number?: string | null;
  engine_number?: string | null;
  horsepower?: string | null;
  color?: string | null;
  plate_number: string;
  belongings_json?: string | null;
  agreed_selling_price?: number | null;
  commission_or_net_payout?: string | null;
  vehicle_id?: number | null;
  dealership_id?: number | null;
}




