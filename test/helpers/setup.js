const jexpect = expect;
const sinon = require('sinon');

const chai = require('chai');
const { default: chaiJest } = require('chai-jest');

chai.use(chaiJest);
const chaiMatchPattern = require('chai-match-pattern');
chai.use(chaiMatchPattern);
const _ = chaiMatchPattern.getLodashModule();

_.mixin({
  isAny: function () { return true;},
  
  isFalse: function (v) { return v === false;},
  isTrue:  function (v) { return v === true;},
  
  isOr: function (value, ...tests) {
    while (tests.length) {
      const t = tests.shift();
      if (_.isString(t) && _.has(_, t)) {
        if (_.invoke(_, t, value)) return true;
      } else if (_.isRegExp(t)) {
        // todo fix this when you want to use it, it's getting regex as string,
        if (t.test(value)) return true;
      } else {
        if (_.isEqual(value, t)) return true;
      }
    }
    return false;
  },
});


module.exports = {
  expect: chai.expect,
  jexpect,
  _,
  sinon
};
