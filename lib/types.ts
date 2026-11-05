export type Cell = number | null;
export type Crop = { x: number; y: number; width: number; height: number };
export type PatternStyle = 'easy' | 'refined' | 'outline' | 'faithful';
export type Params = { longEdge: number; maxColors: number; crop: Crop; background: { remove: boolean; color: string; tolerance: number }; style?: PatternStyle };
export type Pattern = { width: number; height: number; grid: Cell[]; paletteVersion: string; params: Params; path: 'cv'; warnings: string[]; complexity: 'simple'|'medium'|'high' };
