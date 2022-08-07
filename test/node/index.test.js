const { expect, _, jexpect, sinon } = require('../helpers/setup.js');

const isPromise = require('ispromise');
const AsyncEvents = require('../../index');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lresCount = (lres, c) => !!lres ? lres + c : lres;

let ae = new AsyncEvents();

const onceEventSpyResponse = 'once-event-spy-response';
const onceEventSpy = sinon.spy((p, m) => {
  /*console.debug(`p: %o, m: %o`, p, m);*/
  return onceEventSpyResponse;
});
const onceEventSpy2Response = 'once-event-spy-2-response';
const onceEventSpy2 = sinon.spy((p, m) => {
  return new Promise((resolve) => setTimeout(resolve, 1500, onceEventSpy2Response));
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
      replace:             _.isBoolean,
    },
    originStack:         `_.isAny`,
    timeoutCallback:     `_.isOr|isFunction|isUndefined`,
    throwOnTimeout:      _.isBoolean,
    stopHere:            _.isBoolean,
    timeout:             _.isNumber,
    catchUp:             `_.isOr|isFalse|isNil|isNumber`,
    once:                _.isBoolean,
    race:                _.isBoolean,
    isLocallyExclusive:  _.isBoolean,
    isGloballyExclusive: _.isBoolean,
    replace:             _.isBoolean,
    trace:               _.isBoolean,
    verbose:             _.isBoolean,
  },
  eventsOptions:    {
    linger:              `_.isOr|isNumber|isNil|isFalse`,
    range:               _.isString,
    bait:                _.isBoolean,
    chain:               _.isBoolean,
    isLocallyExclusive:  _.isBoolean,
    isGloballyExclusive: _.isBoolean,
    replace:             _.isBoolean,
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
    
    
    
    describe('## resolves to listener(s) response(s)', function () {
      it.each([
        ['listener-response'],
        [undefined],
      ])(`emitEvent resolves to "%s" from listener`, async function (lres) {
        const epay = 'emit-payload';
        const evID = 'on-event-listener';
        const spy = sinon.spy((p, m) => lres);
        
        ae.onEvent(evID, spy);
        const res = ae.emitEvent(evID, epay);
        
        expect(spy).to.have.been.calledOnceWith(epay);
        expect(await res).to.be.equal(lres);
        
        ae.eraseEvent(evID);
      });
      
      it.each([
        ['listener-response'],
        [undefined],
      ])(`emitEvent resolves to "%s" from listener that catches up`, async function (lres) {
        const epay = 'emit-payload';
        const evID = 'on-event-listener';
        let count = 0;
        const cb = (p, m) => lresCount(lres, ++count);
        
        const res = ae.emitEvent(evID, epay, { linger: 200 });
        await wait(69);
        ae.onEvent(evID, cb, { catchUp: true });
        await wait(69);
        ae.onceEvent(evID, cb, { catchUp: true });
        
        const outcome = await res;
        expect(outcome).to.be.equal(lresCount(lres, count));
        
        ae.eraseEvent(evID);
      });
      
      it(`emitEvent (multiple events) resolves with listeners responses in [] (none respond).`, async function () {
        const epay = 'emit-payload';
        const evIDs = ['on-event-listener-1', 'on-event-listener-2', 'on-event-listener-3'];
        
        const res = ae.emitEvent(evIDs, epay);
        
        expect(await res[0]).to.be.equal(undefined);
        expect(await res[1]).to.be.equal(undefined);
        expect(await res[2]).to.be.equal(undefined);
        
        ae.eraseEvent(evIDs);
      });
      
      it.each([
        [500],
        [false],
      ])(`emitEvent (multiple events) resolves with listeners responses in [] (single one that responds); lingering: %s.`, async function (linger) {
        const epay = 'emit-payload';
        const lres = 'listeners-response';
        const evIDs = ['on-event-listener-1', 'on-event-listener-2', 'on-event-listener-3'];
        const spy = sinon.spy((p, m) => lres);
        
        ae.onEvent(evIDs[1], spy);
        const res = ae.emitEvent(evIDs, epay, { linger });
        
        expect(spy).to.have.been.calledOnceWith(epay);
        expect(await res[0]).to.be.equal(undefined);
        expect(await res[1]).to.be.equal(lres);
        expect(await res[2]).to.be.equal(undefined);
        
        ae.eraseEvent(evIDs);
      });
      
      it.each([
        ['listeners-response'],
        [undefined],
      ])(`emitEvent (multiple events) resolves with "%s" in all listeners as an array of promises.`, async function (lres) {
        const epay = 'emit-payload';
        const evIDs = ['on-event-listener-1', 'on-event-listener-2', 'on-event-listener-3'];
        const spy = sinon.spy((p, m) => lres);
        const spy1 = sinon.spy((p, m) => lresCount(lres,1));
        const spy2 = sinon.spy((p, m) => lresCount(lres,2));
        
        ae.onEvent(evIDs[0], spy);
        ae.onEvent(evIDs[1], spy1);
        ae.onEvent(evIDs[2], spy2);
        const res = ae.emitEvent(evIDs, epay);
        
        expect(spy).to.have.been.calledOnceWith(epay);
        expect(spy1).to.have.been.calledOnceWith(epay);
        expect(spy2).to.have.been.calledOnceWith(epay);
        expect(await res[0]).to.be.equal(lres);
        expect(await res[1]).to.be.equal(lresCount(lres,1));
        expect(await res[2]).to.be.equal(lresCount(lres,2));
        
        ae.eraseEvent(evIDs);
      });
    });
    
    
    it(`emitted events "once-event" and "on-event" separately, and returned unresolved promises.`, async function () {
      console.time('once-event');
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
        
        
        
        describe(`# new "once-event" listener "hears" lingering event without callback`, function () {
          test(`lingered event "once-event" has 1 consumer.`, async function () {
            const consumers = ae.eventConsumers(ae.lingeringEvents('once-event'));
            expect(consumers).to.have.lengthOf(1);
          });
          
          test(`listener "vowOnceEvent1" is a promise after listening to "once-event" lingering event.`, async function () {
            vowOnceEvent1 = ae.onceEvent('once-event', undefined, undefined, 111);
            expect(isPromise(vowOnceEvent1)).to.be.true;
          });
          
          test(`listener was not stashed.`, async function () {
            expect(ae.hasListener('once-event')).to.be.false;
          });
          
          test(`"vowOnceEvent1" resolves to "onceEventSpy" response.`, async function () {
            expect(await vowOnceEvent1).to.be(onceEventSpyResponse);
          });
          
          test(`lingered event "once-event" has 2 consumers, even though this listener wasn't stashed.`, async function () {
            const consumers = ae.eventConsumers(ae.lingeringEvents('once-event'));
            expect(consumers).to.have.lengthOf(2);
          });
        });
        
        
        
        describe(`# new "once-event" listener "hears" lingering event with callback`, function () {
          test(`listener "vowOnceEvent2" is a promise after listening to "once-event" lingering event.`, async function () {
            vowOnceEvent2 = ae.onceEvent('once-event', onceEventSpy2, undefined, 222);
            expect(isPromise(vowOnceEvent2)).to.be.true;
          });
          
          test(`listener was stashed since "onceEventSpy2" is a promise that takes 1500ms to resolve.`, async function () {
            expect(ae.hasLingeringEvent('once-event')).to.be.true;
            expect(ae.hasListener('once-event')).to.be.true;
          });
          
          test(`lingered event "once-event" now has 3 consumers.`, async function () {
            const consumers = ae.eventConsumers(ae.lingeringEvents('once-event'));
            expect(consumers).to.have.lengthOf(3);
          });
          
          test(`lingered event "once-event" has only 1 PENDING consumer after 500ms.`, async function () {
            const le = ae.lingeringEvents('once-event');
            await new Promise(r => setTimeout(r, 500));
            const consumers = ae.pendingEventConsumers(le);
            expect(consumers).to.have.lengthOf(1);
          });
          
          test(`lingered event "once-event" decays after at least 1000ms ("vowEmit_onceEvent" promise does NOT resolve).`, async function () {
            // const clock = sinon.useFakeTimers({ now: new Date(), shouldAdvanceTime: true });
            // await clock.tickAsync(1200);
            await new Promise(r => setTimeout(r, 500));
            // console.timeEnd('once-event');
            expect(ae.hasLingeringEvent('once-event')).to.be.false;
          });
          
          test(`long promised "once-event" listener is still running...`, async function () {
            expect(ae.hasListener('once-event')).to.be.true;
          });
          
          test(`wait for the listener "vowOnceEvent2" to resolve to "onceEventSpy2" response.`, async function () {
            expect(await vowOnceEvent2).to.be(onceEventSpy2Response);
            console.timeEnd('once-event');
          });
          
          test(`"onceEventSpy2" to have been called once and returned the appropriate response`, async function () {
            expect(onceEventSpy2).to.have.been.calledOnce;
            expect(onceEventSpy2).to.have.returned(sinon.match.instanceOf(Promise));
            return expect(onceEventSpy2.returnValues[0]).to.eventually.become(onceEventSpy2Response);
          });
          
          test(`long promised "once-event" listener no longer running...`, async function () {
            expect(ae.hasListener('once-event')).to.be.false;
          });
          
          test(`"vowEmit_onceEvent" promise resolves with result of last callback "onceEventSpy2" and wasn't rejected`, async function () {
            expect(await vowEmit_onceEvent).to.be.equal(onceEventSpy2Response);
          });
        });
        
        
        
        test(`"once-event" lingering event and listeners are clear from stores`, async function () {
          //console.timeEnd('once-event');
          expect(ae.hasLingeringEvent('once-event')).to.be.false;
          expect(ae.hasListener('once-event')).to.be.false;
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
        test(`"vowEmit_onEvent" and "vowEmit_onEvent2" resolve to the event's last callback output.`, async function () {
          // todo fix this or the tests
          expect(await vowEmit_onEvent).to.be.equal(payload_onEvent);
          expect(await vowEmit_onEvent2).to.be.equal(payload_onEvent2);
        });
      });
    });
  });
  
  
  describe(`# serial callback - callback runs exclusively and listener waits for callback to resolve before running it for other events.`, function () {
    let accum = 0, vows = [];
    const serialSpy = sinon.spy((payl) => new Promise(r => setTimeout(() => r(accum += payl), payl)));
    
    test(`serial listener callback invocation. runs 3 events in series, with gaps between them that should take at least 650ms.`, async function () {
      ae.onEvent('serial-event', serialSpy, { serialCallbacks: true });
      
      const startTime = Date.now();
      {
        vows.push(ae.emitEvent('serial-event', 200));
        // just wait a few ms before emitting another event
        await new Promise(resolve => setTimeout(() => {
          resolve(vows.push(ae.emitEvent('serial-event', 150)));
        }, 50));
        // just wait a few ms before emitting another event
        await new Promise(resolve => setTimeout(() => {
          resolve(vows.push(ae.emitEvent('serial-event', 100)));
        }, 150));
        // now finally wait for all 3 to resolve
        await Promise.all(vows);
      }
      const stopTime = Date.now();
      
      // this shows that the callback waited for all the given timeouts + the gaps in between. extra processing time makes this go above 650
      expect(stopTime - startTime).to.be.at.least(650);
    });
    
    test(`"serialSpy" was called 3 times, once for each event emitted.`, async function () {
      expect(serialSpy).to.have.been.calledThrice;
    });
    
    describe(`# events were passed the correct arguments (it wasn't a race condition)`, function () {
      test(`accumulated result has correct value (accumulated from each call)`, async function () {
        expect(accum).to.be.equal(450); // just checking we got all arguments correctly
      });
      
      test(`first event promise`, async function () {
        expect(serialSpy.firstCall.firstArg).to.be.equal(200);
      });
      test(`second event promise`, async function () {
        expect(serialSpy.secondCall.firstArg).to.be.equal(150);
      });
      test(`third event promise`, async function () {
        expect(serialSpy.thirdCall.firstArg).to.be.equal(100);
      });
    });
    
    describe(`# each event promise resolved to correct result`, function () {
      test(`first event promise`, async function () {
        expect(await vows[0]).to.be.equal(200);
      });
      test(`second event promise`, async function () {
        // todo fix this or the tests
        expect(await vows[1]).to.be.equal(350);
      });
      test(`third event promise`, async function () {
        // todo fix this or the tests
        expect(await vows[2]).to.be.equal(450);
      });
    });
    
  });
  
});
