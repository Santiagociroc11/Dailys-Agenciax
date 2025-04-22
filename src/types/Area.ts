export interface Area {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AreaUserAssignment {
  id: string;
  user_id: string;
  area_id: string;
  created_at?: string;
}

export interface AreaWithUsers extends Area {
  users: {
    id: string;
    name: string;
    email: string;
  }[];
}

export interface UserWithAreas {
  id: string;
  name: string;
  email: string;
  areas: {
    id: string;
    name: string;
    description?: string;
  }[];
} 