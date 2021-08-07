const { expect, _, jexpect, sinon } = require('../helpers/setup.js');

const Promise = require('bluebird');
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
    
    it(`emitted events "once-event" and "on-event" separately, and returned unresolved Bluebird promises.`, async function () {
      vowEmit_onceEvent = ae.emitEvent('once-event', payload_onceEvent);
      // increase linger time coz we are going to wait for once-event to stop lingering, which eats about 500ms
      vowEmit_onEvent = ae.emitEvent('on-event', payload_onEvent, { linger: 1000, rejectUnconsumed: true });
      
      expect(vowEmit_onceEvent).to.be.an.instanceof(Promise);
      expect(vowEmit_onceEvent.isPending()).to.be.true;
      expect(vowEmit_onEvent).to.be.an.instanceof(Promise);
      expect(vowEmit_onEvent.isPending()).to.be.true;
    });
    
    
    
    describe(`# "once-event" event `, function () {
      it(`ran "onceEventSpy" once and listener was removed`, async function () {
        expect(onceEventSpy).to.have.been.calledOnce;
        expect(ae.hasListener('once-event')).to.be.false;
      });
      
      it(`called "onEventSpy" with appropriate arguments.`, async function () {
        expect(onceEventSpy).to.have.been.calledWith(payload_onceEvent, sinon.match({
          eventMeta:       sinon.match.object,
          listenerOptions: sinon.match.object,
          extra:           undefined,
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
          eventMeta:       sinon.match.object,
          listenerOptions: sinon.match.object,
          extra:           undefined,
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
          vowOnceEvent1 = ae.onceEvent('once-event', undefined, { subscriberId: 111 });
          expect(ae.hasListener('once-event')).to.be.false;
          expect(vowOnceEvent1.isPending()).to.be.false;
          expect(vowEmit_onceEvent.isPending()).to.be.true;
        });
        
        test(`"vowOnceEvent1" resolves to "onceEventSpy" response.`, async function () {
          expect(vowOnceEvent1).to.be.instanceof(Promise);
          return expect(vowOnceEvent1).to.become(onceEventSpyResponse);
        });
        
        test(`new listener "hears" lingering event with callback, and is not curated.`, async function () {
          expect(ae.hasLingeringEvent('once-event')).to.be.true;
          vowOnceEvent2 = ae.onceEvent('once-event', onceEventSpy2);
          
          expect(ae.hasListener('once-event')).to.be.false;
          
          expect(vowOnceEvent2.isPending()).to.be.false;
          expect(vowEmit_onceEvent.isPending()).to.be.true;
        });
        
        test(`"vowOnceEvent2" resolves to "onceEventSpy2" response.`, async function () {
          expect(vowOnceEvent2).to.be.instanceof(Promise);
          return expect(vowOnceEvent2).to.become(onceEventSpy2Response);
        });
        
        test(`"onceEventSpy2" to have been called once and returned the appropriate response`, async function () {
          expect(onceEventSpy2).to.have.been.calledOnce;
          expect(onceEventSpy2).to.have.returned(onceEventSpy2Response);
        });
        
        test(`"vowEmit_onceEvent" Bluebird promise resolves with result of last callback "onceEventSpy2" and wasn't rejected`, async function () {
          expect(vowEmit_onceEvent.isPending()).to.be.true;
          const outcome = await vowEmit_onceEvent;
          expect(outcome).to.be.equal(onceEventSpy2Response);
          expect(vowEmit_onceEvent.isResolved()).to.be.true;
          expect(vowEmit_onceEvent.isRejected()).to.be.false;
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
            expect(emitOnceEventR.isResolved()).to.be.true;
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
          expect(vowEmit_onEvent.isPending()).to.be.true;
          expect(vowEmit_onEvent2.isPending()).to.be.true;
          
          const outcome2 = await vowEmit_onEvent;
          const outcome3 = await vowEmit_onEvent2;
          expect(outcome2).to.be.equal(payload_onEvent);
          expect(outcome3).to.be.equal(payload_onEvent2);
          
          expect(vowEmit_onEvent.isResolved()).to.be.true;
          expect(vowEmit_onEvent.isRejected()).to.be.false;
          expect(vowEmit_onEvent.isResolved()).to.be.true;
          expect(vowEmit_onEvent.isRejected()).to.be.false;
        });
      });
    });
  });
});
