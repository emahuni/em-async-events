const { expect, _, jexpect, sinon } = require('../helpers/setup.js');

const AsyncEvents = require('../../index');

let ae = new AsyncEvents();

const onceEventSpyResponse = 'once-event-spy-response';
// noinspection JSCheckFunctionSignatures
const onceEventSpy = sinon.spy((p, m) => {
  /*console.debug(`p: %o, m: %o`, p, m);*/
  return onceEventSpyResponse;
});

const onEventSpy = sinon.spy();
const asyncEventSpy = sinon.spy();

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


describe(`# em-async-events`, function () {
  it(`creates a once listener with basic information: onceEvent()`, async function () {
    ae.onceEvent('once-event', onceEventSpy);
    expect('once-event' in ae.events).to.be.true;
    expect(ae.events['once-event'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listener: hasListener()`, async function () {
    expect(ae.hasListener('once-event')).to.be.true;
  });
  
  it(`creates a perpetual listener with basic information: onEvent()`, async function () {
    ae.onEvent('on-event', onEventSpy);
    expect(ae.hasListener('on-event')).to.be.true;
    expect(ae.events['on-event'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listeners: hasListeners()`, async function () {
    expect(ae.hasListeners('once-event')).to.be.true;
    expect(ae.hasListeners('on-event')).to.be.true;
    expect(ae.hasListeners(['once-event', 'on-event'])).to.be.true;
  });
  
  
  
  describe(`# emitEvent() `, function () {
    let vow, payload = 'emit-payload';
    
    beforeAll(async function () {
      vow = ae.emitEvent('once-event', payload);
    });
    
    it(`returned a promise that is not yet resolved`, async function () {
      expect(vow).to.be.an.instanceof(Promise);
    });
    
    describe(`# onceEventSpy ()`, function () {
      it(`ran once and listener was removed`, async function () {
        expect(onceEventSpy).to.have.been.calledOnce;
        expect(ae.hasListener('once-event')).to.be.false;
      });
      
      it(`called with appropriate arguments.`, async function () {
        expect(onceEventSpy).to.have.been.calledWith(payload, sinon.match({
          eventMeta:       sinon.match.object,
          listenerOptions: sinon.match.object,
          extra:           undefined,
        }));
      });
      
      it(`return the appropriate response`, async function () {
        expect(onceEventSpy).to.have.returned(onceEventSpyResponse);
      });
    });
    
    describe(`# lingering event`, function () {
      it(`has once-event lingering event`, async function () {
        expect(ae.hasLingeringEvent('once-event')).to.be.true;
      });
      
      it.skip(`returned a promise with result of last callback`, async function () {
        expect(vow).to.be.an.instanceof(Promise);
      });
    });
  });
  
  
  
  
  describe(`# onEvent() - returns a promise that resolves to event payload`, function () {
    let vow;
    beforeAll(async function () {
      vow = ae.onEvent('async-event', asyncEventSpy);
    });
    
    it(`returned a promise`, async function () {
      expect(ae.hasListener('async-event')).to.be.true;
      expect(vow).to.be.an.instanceof(Promise);
    });
    
    it.skip(`promise resolves to event payload`, async function () {
    
    });
  });
  
});
