const { expect, _, sinon } = require('../helpers/setup.js');

const AsyncEvents = require('../../index');

let ae = new AsyncEvents();

const cb1 = sinon.spy();
const cb2 = sinon.spy();
const cb3 = sinon.spy();
const cb4 = sinon.spy();

const defaultOptionsMatcher = {
  listenersOptions: {
    extra:            `_.isAny`,
    expiryCallback:   `_.isOr|isFunction|isUndefined`,
    stopHere:         _.isBoolean,
    expire:           _.isNumber,
    catchUp:          `_.isOr|isFalse|isNil|isNumber`,
    once:             _.isBoolean,
    isExclusive:      _.isBoolean,
    replaceExclusive: _.isBoolean,
    trace:            _.isBoolean,
    verbose:          _.isBoolean,
  },
  eventsOptions:    {
    linger:           `_.isOr|isNumber|isNil|isFalse`,
    range:            _.isString,
    bait:             _.isBoolean,
    isExclusive:      _.isBoolean,
    keepExclusive:    _.isBoolean,
    trace:            _.isBoolean,
    verbose:          _.isBoolean,
    rejectUnconsumed: _.isBoolean,
  },
};

describe(`em-async-events`, function () {
  it(`creates a once listener with basic information: onceEvent()`, async function () {
    ae.onceEvent('huga', cb1);
    expect('huga' in ae.events).to.be.true;
    expect(ae.events['huga'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listener: hasListener()`, async function () {
    expect(ae.hasListener('huga')).to.be.true;
  });
  
  it(`creates a perpetual listener with basic information: onEvent()`, async function () {
    ae.onEvent('huga1', cb2);
    expect(ae.hasListener('huga1')).to.be.true;
    expect(ae.events['huga1'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listeners: hasListeners()`, async function () {
    expect(ae.hasListeners('huga')).to.be.true;
    expect(ae.hasListeners('huga1')).to.be.true;
    expect(ae.hasListeners(['huga', 'huga1'])).to.be.true;
  });
  
  
});
