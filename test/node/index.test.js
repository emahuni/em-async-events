const { expect, _, jexpect, sinon } = require('../helpers/setup.js');

const isPromise = require('ispromise');
const AsyncEvents = require('../../index');

let ae = new AsyncEvents();

const onceEventSpyResponse = 'once-event-spy-response';
const onceEventSpy = sinon.spy((p, m) => {
  /*console.debug(`p: %o, m: %o`, p, m);*/
  return onceEventSpyResponse;
});
const onceEventSpy2Response = 'once-event-spy-2-response';
const onceEventSpy2 = sinon.spy((p, m) => {
  return onceEventSpy2Response;
});


const onEventSpyResponse = 'on-event-spy-response';
const onEventSpy = sinon.spy((p, m) => {
  return p;
});

const onEventSpy2 = sinon.spy((p, m) => {
  return p;
});

const asyncEventSpy = sinon.spy();

const defaultOptionsMatcher = {
  listenersOptions: {
    extra:               `_.isAny`,
    callbacks:           {
      serialExecution:     _.isBoolean,
      debounce:            `_.isOr|isBoolean|isObject|isNil`,
      throttle:            `_.isOr|isBoolean|isObject|isNil`,
      isLocallyExclusive:  _.isBoolean,
      isGloballyExclusive: _.isBoolean,
      replaceExclusive:    _.isBoolean,
    },
    expiryCallback:      `_.isOr|isFunction|isUndefined`,
    stopHere:            _.isBoolean,
    expire:              _.isNumber,
    catchUp:             `_.isOr|isFalse|isNil|isNumber`,
    once:                _.isBoolean,
    isLocallyExclusive:  _.isBoolean,
    isGloballyExclusive: _.isBoolean,
    replaceExclusive:    _.isBoolean,
    trace:               _.isBoolean,
    verbose:             _.isBoolean,
  },
  eventsOptions:    {
    linger:              `_.isOr|isNumber|isNil|isFalse`,
    range:               _.isString,
    bait:                _.isBoolean,
    chain:               _.isBoolean,
    islocallyExclusive:  _.isBoolean,
    isGloballyExclusive: _.isBoolean,
    replaceExclusive:       _.isBoolean,
    trace:               _.isBoolean,
    verbose:             _.isBoolean,
    rejectUnconsumed:    _.isBoolean,
  },
};


describe(`# em-async-events`, function () {
  it(`creates a once listener with basic information: onceEvent()`, async function () {
    ae.onceEvent('once-event', onceEventSpy);
    expect('once-event' in ae.listenersStore).to.be.true;
    expect(ae.listenersStore['once-event'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listener: hasListener()`, async function () {
    expect(ae.hasListener('once-event')).to.be.true;
  });
  
  it(`creates a perpetual listener with basic information: onEvent()`, async function () {
    ae.onEvent('on-event', onEventSpy);
    expect(ae.hasListener('on-event')).to.be.true;
    expect(ae.listenersStore['on-event'][0].listenerOptions).to.matchPattern(defaultOptionsMatcher.listenersOptions);
  });
  
  it(`can detect the listeners: hasListeners()`, async function () {
    expect(ae.hasListeners('once-event')).to.be.true;
    expect(ae.hasListeners('on-event')).to.be.true;
    expect(ae.hasListeners(['once-event', 'on-event'])).to.be.true;
  });
  
  
  
  describe(`# emitEvent() `, function () {
    let vowEmit_onceEvent, vowEmit_onEvent, vowEmit_onEvent2, payload_onceEvent = 'emit-payload',
        payload_onEvent = 'emit-payload-2', payload_onEvent2 = 'emit-payload-3';
    
    beforeAll(async function () {
    });
    
    it(`emitted events "once-event" and "on-event" separately, and returned unresolved promises.`, async function () {
      vowEmit_onceEvent = ae.emitEvent('once-event', payload_onceEvent);
      // increase linger time coz we are going to wait for once-event to stop lingering, which eats about 500ms
      vowEmit_onEvent = ae.emitEvent('on-event', payload_onEvent, { linger: 1000, rejectUnconsumed: true });
      
      expect(isPromise((vowEmit_onceEvent))).to.be.true;
      expect(isPromise((vowEmit_onEvent))).to.be.true;
    });
    
    
    
    describe(`# "once-event" event `, function () {
      it(`ran "onceEventSpy" once and listener was removed`, async function () {
        expect(onceEventSpy).to.have.been.calledOnce;
        expect(ae.hasListener('once-event')).to.be.false;
      });
      
      it(`called "onEventSpy" with appropriate arguments.`, async function () {
        expect(onceEventSpy).to.have.been.calledWith(payload_onceEvent, sinon.match({
          eventMeta:    sinon.match.object,
          listenerMeta: sinon.match.object,
          extra:        undefined,
        }));
      });
      
      it(`"onEventSpy" return the appropriate response`, async function () {
        expect(onceEventSpy).to.have.returned(onceEventSpyResponse);
      });
    });
    
    
    
    describe(`# "on-event" event `, function () {
      it(`ran "onEventSpy" once and preserved listener.`, async function () {
        expect(onEventSpy).to.have.been.calledOnce;
        expect(ae.hasListener('on-event')).to.be.true;
      });
      
      it(`called "onEventSpy" with appropriate arguments.`, async function () {
        expect(onEventSpy).to.have.been.calledWith(payload_onEvent, sinon.match({
          eventMeta:    sinon.match.object,
          listenerMeta: sinon.match.object,
          extra:        undefined,
        }));
      });
      
      it(`"onEventSpy" returned the appropriate response`, async function () {
        expect(onEventSpy).to.have.returned(payload_onEvent);
      });
      
      test(`if "on-event" event is emitted again, it runs "onEventSpy" again and preserves listener.`, async function () {
        // increase linger time coz we are going to wait for once-event to stop lingering, which eats about 500ms
        vowEmit_onEvent2 = ae.emitEvent('on-event', payload_onEvent2, { linger: 1000, rejectUnconsumed: true });
        
        expect(onEventSpy).to.have.been.calledTwice;
        expect(ae.hasListener('on-event')).to.be.true;
      });
    });
    
    
    describe(`# lingering event`, function () {
      let vowOnceEvent1, vowOnceEvent2;
      
      describe(`# "once-event" lingering`, function () {
        it(`has "once-event" lingering event and no listeners.`, async function () {
          expect(ae.hasLingeringEvent('once-event')).to.be.true;
          expect(ae.hasListener('once-event')).to.be.false;
        });
        
        test(`new listener "hears" lingering event without callback, and is not curated.`, async function () {
          vowOnceEvent1 = ae.onceEvent('once-event', undefined, undefined,  111 );
          expect(ae.hasListener('once-event')).to.be.false;
        });
        
        test(`"vowOnceEvent1" resolves to "onceEventSpy" response.`, async function () {
          expect(isPromise(vowOnceEvent1)).to.be.true;
          return expect(vowOnceEvent1).to.become(onceEventSpyResponse);
        });
        
        test(`new listener "hears" lingering event with callback, and is not curated.`, async function () {
          expect(ae.hasLingeringEvent('once-event')).to.be.true;
          vowOnceEvent2 = ae.onceEvent('once-event', onceEventSpy2);
          
          expect(ae.hasListener('once-event')).to.be.false;
        });
        
        test(`"vowOnceEvent2" resolves to "onceEventSpy2" response.`, async function () {
          expect(isPromise(vowOnceEvent2)).to.be.true;
          return expect(vowOnceEvent2).to.become(onceEventSpy2Response);
        });
        
        test(`"onceEventSpy2" to have been called once and returned the appropriate response`, async function () {
          expect(onceEventSpy2).to.have.been.calledOnce;
          expect(onceEventSpy2).to.have.returned(onceEventSpy2Response);
        });
        
        test(`"vowEmit_onceEvent" promise resolves with result of last callback "onceEventSpy2" and wasn't rejected`, async function () {
          const outcome = await vowEmit_onceEvent;
          expect(outcome).to.be.equal(onceEventSpy2Response);
        });
        
        test(`"once-event" lingering event and listeners are clear from stores`, async function () {
          expect(ae.hasListener('once-event')).to.be.false;
          expect(ae.hasLingeringEvent('once-event')).to.be.false;
        });
        
        describe(`# lingering disabled`, function () {
          let onceEventR, emitOnceEventR, payload = 'simple-payload';
          beforeAll(async function () {
            onceEventSpy.resetHistory();
            
            onceEventR = ae.onceEvent('once-event', onceEventSpy);
            emitOnceEventR = ae.emitEvent('once-event', payload, { linger: false, rejectUnconsumed: true });
          });
          
          test(`there is no "once-event" lingering event.`, async function () {
            expect(ae.hasLingeringEvents('once-event')).to.be.false;
          });
          
          test(`"emitOnceEventR" resolved and didn't throw any errors or rejected`, async function () {
            return expect(emitOnceEventR).to.not.have.rejected;
          });
          
          test(`"once-event" was listened to and heard without a problem.`, async function () {
            expect(onceEventSpy).to.have.been.calledOnce;
            return expect(onceEventR).to.eventually.equal(payload).and.not.have.rejected;
          });
        });
      });
      
      
      describe(`# "on-event" lingering`, function () {
        test(`"vowEmit_onEvent" and "vowEmit_onEvent2" resolve to the event's last callback payload.`, async function () {
          const outcome2 = await vowEmit_onEvent;
          const outcome3 = await vowEmit_onEvent2;
          expect(outcome2).to.be.equal(payload_onEvent);
          expect(outcome3).to.be.equal(payload_onEvent2);
        });
      });
    });
  });
  
  
  describe(`# serial callback - callback runs exclusively and listener waits for callback to resolve before running it for other events.`, function () {
    let accum = 0, vows = [];
    const serialSpy = sinon.spy((payl) => new Promise(r => setTimeout(() => r(accum += payl), payl)));
    
    test(`serial listener callback invocation`, async function () {
      ae.onEvent('serial-event', serialSpy, { serialCallbacks: true });
      const startTime = Date.now();
      {
        vows.push(ae.emitEvent('serial-event', 200));
        await new Promise(resolve => setTimeout(() => resolve(vows.push(ae.emitEvent('serial-event', 150))), 50));
        await new Promise(resolve => setTimeout(() => resolve(vows.push(ae.emitEvent('serial-event', 100))), 50));
        await Promise.all(vows);
      }
      const stopTime = Date.now();
      
      expect(serialSpy).to.have.been.calledThrice;
      expect(stopTime - startTime).to.be.at.least(550); // this shows that the callback waited for all the given timeouts + the gaps between
      expect(accum).to.be.equal(450); // just checking we got all arguments correctly
    });
  });
  
});
