export type Place = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
  // Set once this place has been confirmed as a real, routable bus stop
  // (via the nearest-stop picker -- see hooks/use-nearest-stop-confirm.tsx).
  // A trip leg between two nodeId-bearing places routes over the real
  // graph (POST /trip/from-nodes); otherwise the backend geocodes the raw
  // text/coordinates itself (POST /trip).
  nodeId?: number;
};
