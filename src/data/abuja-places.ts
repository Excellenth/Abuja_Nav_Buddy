export type Place = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
};

export const PLACES: Place[] = [
  { id: "millennium-park", name: "Millennium Park", category: "Leisure", lat: 9.0745, lng: 7.4915 },
  { id: "national-mosque", name: "National Mosque", category: "Landmark", lat: 9.0669, lng: 7.4913 },
  { id: "national-church", name: "National Christian Centre", category: "Landmark", lat: 9.0631, lng: 7.4972 },
  { id: "aso-rock", name: "Aso Rock", category: "Landmark", lat: 9.0833, lng: 7.5333 },
  { id: "jabi-lake-mall", name: "Jabi Lake Mall", category: "Leisure", lat: 9.0699, lng: 7.4207 },
  { id: "wuse-market", name: "Wuse Market", category: "Market", lat: 9.0731, lng: 7.4741 },
  { id: "utako-market", name: "Utako Market", category: "Market", lat: 9.0669, lng: 7.4406 },
  { id: "berger-junction", name: "Berger Junction", category: "Transport", lat: 9.0592, lng: 7.4695 },
  { id: "area-1", name: "Area 1 (Garki)", category: "Transport", lat: 9.0334, lng: 7.4914 },
  { id: "nyanya-park", name: "Nyanya Motor Park", category: "Transport", lat: 9.0447, lng: 7.5836 },
  { id: "kubwa", name: "Kubwa", category: "Transport", lat: 9.1547, lng: 7.3252 },
  { id: "gwarinpa", name: "Gwarinpa Estate", category: "Transport", lat: 9.1055, lng: 7.4033 },
  { id: "nnamdi-airport", name: "Nnamdi Azikiwe Airport", category: "Transport", lat: 9.0068, lng: 7.2632 },
  { id: "central-station", name: "Central Metro Station", category: "Transport", lat: 9.0347, lng: 7.4894 },
  { id: "national-hospital", name: "National Hospital Abuja", category: "Hospital", lat: 9.0466, lng: 7.4913 },
  { id: "cedarcrest", name: "Cedarcrest Hospitals", category: "Hospital", lat: 9.0563, lng: 7.4692 },
  { id: "three-arms-zone", name: "Three Arms Zone", category: "Government", lat: 9.0578, lng: 7.5247 },
  { id: "eagle-square", name: "Eagle Square", category: "Government", lat: 9.0546, lng: 7.4934 },
  { id: "cbd", name: "Central Business District", category: "Landmark", lat: 9.0563, lng: 7.4898 },
  { id: "maitama", name: "Maitama District", category: "Landmark", lat: 9.0873, lng: 7.4977 },
  { id: "asokoro", name: "Asokoro District", category: "Landmark", lat: 9.0459, lng: 7.5218 },
  { id: "garki-market", name: "Garki Model Market", category: "Market", lat: 9.0387, lng: 7.4855 },
];
