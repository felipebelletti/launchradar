declare module 'react-grid-layout' {
  import type { Component } from 'react';

  export interface Layout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    static?: boolean;
  }

  export interface Layouts {
    [P: string]: Layout[];
  }

  export interface ResponsiveProps {
    className?: string;
    width?: number;
    layouts?: Layouts;
    breakpoints?: Record<string, number>;
    cols?: Record<string, number>;
    rowHeight?: number;
    onLayoutChange?: (layout: Layout[], layouts: Layouts) => void;
    draggableHandle?: string;
    containerPadding?: [number, number];
    margin?: [number, number];
    useCSSTransforms?: boolean;
    children?: React.ReactNode;
  }

  export class Responsive extends Component<ResponsiveProps> {}
  export class ResponsiveGridLayout extends Component<ResponsiveProps> {}
  export class GridLayout extends Component<ResponsiveProps> {}
  export { GridLayout as default };
}

declare module 'react-grid-layout/css/styles.css' {
  const content: string;
  export default content;
}

declare module 'react-resizable/css/styles.css' {
  const content: string;
  export default content;
}
