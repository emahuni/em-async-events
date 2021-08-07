const { expect, _, jexpect, sinon } = require('../helpers/setup.js');

const Bluebird = require('bluebird');
const AsyncEvents = require('../../index');

let ae = new AsyncEvents();

const onceEventSpyResponse = 'once-event-spy-response';
const onceEventSpy = sinon.spy((p, m) => {
  /*console.debug(`p: %o, m: %o`, p, m);*/
  return onceEventSpyResponse;
});
const onceEventSpyResponse2 = 'once-event-spy-2-response';
const onceEventSpy2 = sinon.spy((p, m) => {
  return onceEventSpyResponse2;
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
    expect('once-event' in ae.listeners).to.be.true;
    expect(ae.listeners['once-event'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listener: hasListener()`, async function () {
    expect(ae.hasListener('once-event')).to.be.true;
  });
  
  it(`creates a perpetual listener with basic information: onEvent()`, async function () {
    ae.onEvent('on-event', onEventSpy);
    expect(ae.hasListener('on-event')).to.be.true;
    expect(ae.listeners['on-event'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listeners: hasListeners()`, async function () {
    expect(ae.hasListeners('once-event')).to.be.true;
    expect(ae.hasListeners('on-event')).to.be.true;
    expect(ae.hasListeners(['once-event', 'on-event'])).to.be.true;
  });
  
  
  
  describe(`# emitEvent() `, function () {
    let vowEmit, payload = 'emit-payload';
    
    beforeAll(async function () {
      vowEmit = ae.emitEvent('once-event', payload);
    });
    
    it(`returned a Bluebird promise that is not yet resolved`, async function () {
      expect(vowEmit).to.be.an.instanceof(Bluebird);
      expect(vowEmit.isPending()).to.be.true;
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
      let vowOnceEvent1, vowOnceEvent2;
      
      it(`has "once-event" lingering event and no listeners.`, async function () {
        expect(ae.hasLingeringEvent('once-event')).to.be.true;
        expect(ae.hasListener('once-event')).to.be.false;
      });
      
      test(`new listener "hears" lingering event without callback, and is not curated.`, async function () {
        vowOnceEvent1 = ae.onceEvent('once-event', undefined, { subscriberId: 111 });
        expect(ae.hasListener('once-event')).to.be.false;
        expect(vowOnceEvent1.isPending()).to.be.false;
        expect(vowEmit.isPending()).to.be.true; // still pending
      });
      
      test(`new listener "hears" lingering event with callback, and is not curated.`, async function () {
        expect(ae.hasLingeringEvent('once-event')).to.be.true;
        vowOnceEvent2 = ae.onceEvent('once-event', onceEventSpy2);
        
        expect(ae.hasListener('once-event')).to.be.false;
        
        expect(vowOnceEvent2.isPending()).to.be.false;
        expect(vowEmit.isPending()).to.be.true;
      });
      
      test(`"onceEventSpy2" to have been called once and returned the appropriate response`, async function () {
        expect(onceEventSpy2).to.have.been.calledOnce;
        expect(onceEventSpy2).to.have.returned(onceEventSpyResponse2);
      });
      
      test(`onEmit() Bluebird promise resolves with result of last callback (onceEventSpy2)`, async function () {
        expect(vowEmit.isPending()).to.be.true;
        const outcome = await vowEmit;
        expect(vowEmit.isResolved()).to.be.true;
        expect(outcome).to.be.equal(onceEventSpyResponse2);
      });
    });
  });
  
  
  
  
  describe(`# onEvent() - returns a Bluebird promise that resolves to event payload`, function () {
    let vow;
    beforeAll(async function () {
      vow = ae.onEvent('async-event', asyncEventSpy);
    });
    
    it(`returned a Bluebird promise`, async function () {
      expect(ae.hasListener('async-event')).to.be.true;
      expect(vow).to.be.an.instanceof(Bluebird);
    });
    
    it.skip(`Bluebird promise resolves to event payload`, async function () {
    
    });
  });
  
});
