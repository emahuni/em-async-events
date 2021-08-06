declare namespace Chai {
  interface Assertion {
    /** sinon chai */
    called: Assertion;
    calledOnce: Assertion;
    calledTwice: Assertion;
    calledThrice: Assertion;
    calledWithNew: Assertion;
    alwaysCalledWithNew: Assertion;

    callCount(n: number): Assertion;

    calledBefore(spy2): Assertion;

    calledAfter(spy2): Assertion;

    calledImmediatelyBefore(spy2): Assertion;

    calledImmediatelyAfter(spy2): Assertion;

    calledOn(context: unknown): Assertion;

    alwaysCalledOn(context: unknown): Assertion;

    calledWith(...args: unknown[]): Assertion;

    alwaysCalledWith(...args: unknown[]): Assertion;

    calledOnceWith(...args: unknown[]): Assertion;

    calledWithExactly(...args: unknown[]): Assertion;

    alwaysCalledWithExactly(...args: unknown[]): Assertion;

    calledOnceWithExactly(...args: unknown[]): Assertion;

    calledWithMatch(...args: unknown[]): Assertion;

    alwaysCalledWithMatch(...args: unknown[]): Assertion;

    returned(returnVal: unknown): Assertion;

    alwaysReturned(returnVal: unknown): Assertion;

    threw(errorObjOrErrorTypeStringOrNothing: Error | TypeError | undefined): Assertion;

    alwaysThrew(errorObjOrErrorTypeStringOrNothing: Error | TypeError | undefined): Assertion;


    /** chai match pattern */
    matchPattern(pattern: string | object | RegExp): Assertion;


    /** chai-promised */
    eventually: Assertion;
    fulfilled: Assertion;
    rejected: Assertion;
    rejectedWith(error: Error): Assertion;
    notify(done: Function): Assertion;
    become(value: unknown, message: string): Assertion;
  }
}
