import type { Place } from "@/components/AbujaMap";

export const CATEGORIES = [
  "All",
  "Landmark",
  "Transport",
  "Market",
  "Hospital",
  "Government",
  "Leisure",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PLACES: Place[] = [
  { id: "millennium-park", name: "Millennium Park", category: "Leisure", lat: 9.0745, lng: 7.4915, description: "Largest public park in Abuja." },
  { id: "national-mosque", name: "National Mosque", category: "Landmark", lat: 9.0669, lng: 7.4913, description: "Iconic golden-domed mosque." },
  { id: "national-church", name: "National Christian Centre", category: "Landmark", lat: 9.0631, lng: 7.4972, description: "Prominent church opposite the National Mosque." },
  { id: "aso-rock", name: "Aso Rock", category: "Landmark", lat: 9.0833, lng: 7.5333, description: "400m monolith overlooking the city." },
  { id: "jabi-lake-mall", name: "Jabi Lake Mall", category: "Leisure", lat: 9.0699, lng: 7.4207, description: "Waterfront shopping and dining." },
  { id: "wuse-market", name: "Wuse Market", category: "Market", lat: 9.0731, lng: 7.4741, description: "Largest and busiest market in Abuja." },
  { id: "utako-market", name: "Utako Market", category: "Market", lat: 9.0669, lng: 7.4406, description: "Popular local produce market." },
  { id: "nnamdi-airport", name: "Nnamdi Azikiwe Intl. Airport", category: "Transport", lat: 9.0068, lng: 7.2632, description: "Abuja's main international airport." },
  { id: "abuja-metro", name: "Abuja Metro (Central Station)", category: "Transport", lat: 9.0347, lng: 7.4894, description: "Light rail link to the airport." },
  { id: "nyanya-park", name: "Nyanya Motor Park", category: "Transport", lat: 9.0447, lng: 7.5836, description: "Major bus terminal for inter-city travel." },
  { id: "national-hospital", name: "National Hospital Abuja", category: "Hospital", lat: 9.0466, lng: 7.4913, description: "Federal referral hospital in the CBD." },
  { id: "cedarcrest", name: "Cedarcrest Hospitals", category: "Hospital", lat: 9.0563, lng: 7.4692, description: "Private multi-specialty hospital." },
  { id: "three-arms-zone", name: "Three Arms Zone", category: "Government", lat: 9.0578, lng: 7.5247, description: "Presidential Villa, National Assembly, Supreme Court." },
  { id: "eagle-square", name: "Eagle Square", category: "Government", lat: 9.0546, lng: 7.4934, description: "Site of national ceremonies." },
  { id: "central-park", name: "Central Business District", category: "Landmark", lat: 9.0563, lng: 7.4898, description: "Financial and business hub." },
  { id: "ibb-golf", name: "IBB Golf Club", category: "Leisure", lat: 9.0902, lng: 7.4995, description: "Green space and recreation." },
];
