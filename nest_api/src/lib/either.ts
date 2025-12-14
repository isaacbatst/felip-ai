export type Left<L> = [L, undefined];
export type Right<R> = [undefined, R];
export type Either<L, R> = Left<L> | Right<R>;

export const left = <L>(value: L): Left<L> => [value, undefined];
export const right = <R>(value: R): Right<R> => [undefined, value];

export const isLeft = <L, R>(either: Either<L, R>): either is Left<L> => {
  return either[0] !== undefined;
};

export const isRight = <L, R>(either: Either<L, R>): either is Right<R> => {
  return either[1] !== undefined;
};