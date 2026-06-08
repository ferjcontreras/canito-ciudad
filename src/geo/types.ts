export interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OSMWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}

export interface OSMRelation {
  type: 'relation';
  id: number;
  members: Array<{ type: string; ref: number; role: string }>;
  tags: Record<string, string>;
}

export type OSMElement = OSMNode | OSMWay | OSMRelation;

export interface OSMData {
  version: number;
  generator: string;
  elements: OSMElement[];
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}
