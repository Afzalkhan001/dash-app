// react-native-qrcode-svg ships its encoder helpers as untyped JS. These are the two it uses itself to
// draw a code; the poster and pass PDFs reuse them so the printed QR is the same one the screen shows.
declare module 'react-native-qrcode-svg/src/genMatrix' {
  const genMatrix: (value: string, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H') => (0 | 1 | boolean)[][];
  export default genMatrix;
}
declare module 'react-native-qrcode-svg/src/transformMatrixIntoPath' {
  const transformMatrixIntoPath: (matrix: (0 | 1 | boolean)[][], size: number) => { cellSize: number; path: string };
  export default transformMatrixIntoPath;
}
