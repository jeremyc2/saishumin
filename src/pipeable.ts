export type Pipeable<Self, Arguments extends ReadonlyArray<unknown>, Result> = {
	(...arguments_: Arguments): (self: Self) => Result;
	(self: Self, ...arguments_: Arguments): Result;
};
