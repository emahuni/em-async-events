'use strict';

const _ = require('lodash'); // todo tree shake what you need only
const cloneDeep = require('@emahuni/clone-deep');
const isPromise = require('ispromise');
const lineStack = require('line-stack');
const Timeout = require('smart-timeout');

const isBrowser = new Function('try {return this===window;}catch(e){return false;}');
const conGrp = isBrowser() ? console.groupCollapsed : console.warn;
const conGrpEnd = isBrowser() ? console.groupEnd : console.warn;

const NAMES = {
  asyncEvents:          '$asyncEvents',
  onEvent:              '$onEvent',
  onceEvent:            '$onceEvent',
  emitEvent:            '$emitEvent',
  eraseEvent:           '$eraseEvent',
  fallSilent:           '$fallSilent',
  chainCallbackPayload: '$chainCallbackPayload',
  hasListener:          '$hasListener',
  hasListeners:         '$hasListeners',
  hasLingeringEvent:    '$hasLingeringEvent',
  hasLingeringEvents:   '$hasLingeringEvents',
};

const PENDING = 0;
const RESOLVED = 1;
const REJECTED = -1;


class AsyncEvents {
  // listeners;
  // lingeringEvents;
  // options;
  // __vueReservedProps
  
  constructor (options = {}) {
    this._uniqID = this.__genUniqID();
    this.listenersStore = {};
    this.lingeringEventsStore = {};
    
    this.__vueReservedProps = ['$options', '$parent', '$root', '$children', '$refs', '$vnode', '$slots', '$scopedSlots', '$createElement', '$attrs', '$listeners', '$el'];
    
    /**
     * @typedef {
     *  {
     *    stopHere: boolean,
     *    race: boolean,
     *    replace: boolean,
     *    callbacks: {
     *      serialExecution: boolean,
     *      debounce: null,
     *      throttle: null,
     *      replace: boolean,
     *      isGloballyExclusive: boolean,
     *      isLocallyExclusive: boolean
     *    },
     *    isLocallyExclusive: boolean,
     *    timeout: number,
     *    verbose: boolean,
     *    timeoutCallback: undefined,
     *    predicate: undefined,
     *    trace: boolean,
     *    once: boolean,
     *    throwOnTimeout: boolean,
     *    catchup: number,
     *    extra: undefined,
     *    isGloballyExclusive: boolean
     *  }
     * } ListenerOptions
     */
    /** @type ListenerOptions */
    const listenersOptions = {
      extra:               undefined,
      callbacks:           {
        serialExecution: false, // todo rename to serial
        // chain: false, // todo implement (implicates serial)
        debounce:            null,
        throttle:            null,
        isLocallyExclusive:  false,
        isGloballyExclusive: false,
        replace:             false,
      },
      stopHere:            false,
      timeout:             0,
      timeoutCallback:     undefined,
      throwOnTimeout:      false,
      catchup:             100, // a value of true will catch-up whatever lingering event is there.
      once:                false,
      race:                false,
      predicate:           undefined,
      isLocallyExclusive:  false,
      isGloballyExclusive: false,
      replace:             false,
      trace:               false,
      verbose:             false,
    };
    
    /**
     * @typedef {
     *  {
     *    chain: boolean,
     *    trace: boolean,
     *    rejectUnconsumed: boolean,
     *    bait: boolean,
     *    linger: number,
     *    replace: boolean,
     *    range: string,
     *    isGloballyExclusive: boolean,
     *    isLocallyExclusive: boolean,
     *    verbose: boolean
     *  }
     * } EventOptions
     */
    /** @type EventOptions */
    const eventsOptions = {
      // serial: false,     // todo implement
      chain: false,
      /*listeners:           { // todo implement
        serial: false,
        chain: false,
      },*/
      linger:              500,
      bait:                false,
      isLocallyExclusive:  false,
      isGloballyExclusive: false,
      replace:             false,
      range:               'first-parent',
      trace:               false,
      verbose:             false,
      rejectUnconsumed:    false,
    };
    
    this.options = _.defaultsDeep(options, {
      ...NAMES,
      listenersOptions,
      eventsOptions,
      
      maxCachedPayloads: 5,
      
      debug: {
        all:                    true,
        addListener:            false,
        emitEvent:              false,
        eraseEvent:             false,
        invokeListener:         false,
        lingerEvent:            false,
        chainListenerCallbacks: false,
        removeListener:         false,
      },
    });
    
    this.options.asyncEvents = this.__isCorrectCustomName('asyncEvents', options) || NAMES.asyncEvents;
    this.options.onEvent = this.__isCorrectCustomName('onEvent', options) || NAMES.onEvent;
    this.options.onceEvent = this.__isCorrectCustomName('onceEvent', options) || NAMES.onceEvent;
    this.options.emitEvent = this.__isCorrectCustomName('emitEvent', options) || NAMES.emitEvent;
    this.options.eraseEvent = this.__isCorrectCustomName('eraseEvent', options) || NAMES.eraseEvent;
    this.options.fallSilent = this.__isCorrectCustomName('fallSilent', options) || NAMES.fallSilent;
    this.options.chainCallbackPayload = this.__isCorrectCustomName('chainCallbackPayload', options) || NAMES.chainCallbackPayload;
    this.options.hasListener = this.__isCorrectCustomName('hasListener', options) || NAMES.hasListener;
    this.options.hasListeners = this.__isCorrectCustomName('hasListeners', options) || NAMES.hasListeners;
    this.options.hasLingeringEvent = this.__isCorrectCustomName('hasLingeringEvent', options) || NAMES.hasLingeringEvent;
    this.options.hasLingeringEvents = this.__isCorrectCustomName('hasLingeringEvents', options) || NAMES.hasLingeringEvents;
  }
  
  
  /**
   * add event listener
   * @param eventName
   * @param [callback]
   * @param [listenerOptions]
   * @param [subscriberID]
   * @param [listenerOrigin]
   * @return {Promise|array<Promise>} - allows waiting for invocation of event with a promise only once (use if you want to continue execution only when promise is fulfilled)
   */
  onEvent (eventName, callback, listenerOptions, subscriberID = this._uniqID, listenerOrigin) {
    if (!_.isString(eventName) && !_.isArray(eventName)) throw new Error(`[index]-91: onEvent() - eventName should be specified as an string or array of strings representing event name(s)!`);
    
    if (_.isPlainObject(callback)) {
      if (_.isNil(listenerOptions)) listenerOptions = callback;
      callback = undefined;
    }
    
    listenerOptions = _.merge({}, this.options.listenersOptions, listenerOptions);
    if (listenerOptions.isAsync) this.__showDeprecationWarning('isAsync', 'All events and listeners are now async.');
    if (listenerOptions.catchUp) {
      listenerOptions.catchup = listenerOptions.catchUp;
      // this.__showDeprecationWarning('catchUp', 'use catchup instead..');
    }
    
    // if this event doesn't have  a callback, then just create one that returns undefined
    if (!_.isFunction(callback) && !_.isArray(callback)) callback = () => undefined;
    
    const args = {
      eventName,
      callback,
      listenerOptions,
      subscriberID,
      listenerOrigin,
    };
    
    
    let racingListeners;
    if (listenerOptions.race) {
      if (!_.isArray(eventName)) throw new Error(`[em-async-events/onEvent()]-139: cannot use race with a single event id.`);
      if (!listenerOptions.once) throw new Error(`[em-async-events/onEvent()]-140: events racing is for "onceEvent" listeners only since it will unregister the other listeners on the first one that wins the race.`);
      // remember this is an array of listener names. now turn that into a dictionary of listener names for each listener.
      racingListeners = eventName.reduce((accum, l) => {
        accum[l] = null;
        return accum;
      }, {});
    }
    
    if (_.isArray(eventName) || _.isArray(callback)) {
      if (!_.isArray(eventName)) eventName = [eventName];
      if (!_.isArray(callback)) callback = [callback];
      
      const vows = [];
      for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
        // noinspection JSObjectNullOrUndefined
        for (let callbackIndex = 0, _len = callback.length; callbackIndex < _len; callbackIndex++) {
          vows.push(this.__addListener({
            ...args,
            eventName: eventName[eventNameIndex],
            callback:  callback[callbackIndex],
            racingListeners,
          }));
        }
      }
      
      // todo the promise should be the one we can control like other promises we return
      if (listenerOptions.race) return Promise.race(vows); // return a single promise that resolves when one of the promises is resolved todo use Promise.any when using typescript instead, coz race waits for the first reject or resolve read: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any#description
      return vows; // return array of promises
    } else {
      return this.__addListener(args);
    }
  }
  
  
  /**
   * add event listener that only listens for event once and removed once executed
   * @param eventName
   * @param [callback]
   * @param [listenerOptions]
   * @param [subscriberID]
   * @param [listenerOrigin]
   * @return {Promise<*>|array<Promise<*>>} - allows waiting for invocation of event with a promise only once (use if you want to continue execution where you adding the listener only when promise is fulfilled)
   * */
  onceEvent (eventName, callback, listenerOptions, subscriberID = this._uniqID, listenerOrigin) {
    listenerOptions = _.merge({}, this.options.listenersOptions, listenerOptions);
    listenerOptions.once = true;
    
    return this.onEvent(eventName, callback, listenerOptions, subscriberID, listenerOrigin);
  }
  
  
  /**
   * emit event and run callbacks subscribed to the event
   * @param eventName
   * @param [payload]
   * @param [eventOptions] {EventOptions}
   * @param [emitterID]
   * @param [eventOrigin]
   * @return {Promise<*>|array<Promise>}
   */
  emitEvent (eventName, payload, eventOptions, emitterID = this._uniqID, eventOrigin) {
    const originStack = _.pick(lineStack.skipByFilename('em-async-events'), ['filename', 'method', 'line']);
    
    if (!_.isString(eventName) && !_.isArray(eventName)) throw new Error(`[index]-160: emitEvent() - eventName should be specified as an string or array of strings representing event name(s)!`);
    
    /** @type EventOptions */
    eventOptions = _.merge({}, this.options.eventsOptions, eventOptions);
    
    if (eventOptions.isAsync) this.__showDeprecationWarning('isAsync', 'All events and listeners are now async.');
    
    if (eventOptions.bait) {
      eventOptions.linger = Infinity;
      // eventOptions.isGloballyExclusive = true;
    } else if (eventOptions.linger === true) {
      eventOptions.linger = Infinity;
    }
    
    if (!Array.isArray(eventOptions.extras)) eventOptions.extras = [];
    
    const _eventMeta = {
      originStack,
      emitterID,
      stopNow: false,
      get wasConsumed () { return !!_.size(this.consumers); },
      extras: eventOptions.extras,
      // set in __runEvent
      id:             undefined,
      eventName:      undefined,
      consumers:      undefined,
      eventTimestamp: undefined,
      eventOptions:   undefined,
    };
    
    
    if (_.isArray(eventName)) {
      let vows = [];
      
      for (let evName of eventName) {
        const params = cloneDeep({ eventName: evName, eventOptions, eventMeta: _eventMeta });
        /** we didn't want to clone this */
        params.payload = payload;
        params.eventOrigin = eventOrigin;
        params.eventMeta.eventOrigin = eventOrigin;
        const outcome = this.__runEvent(params);
        
        /** linger */
        if (params.eventMeta.stopNow) {
          vows.push(outcome);
        } else {
          vows.push(this.__lingerEvent({
            eventName: evName,
            payload:   eventOptions.chain && params.eventMeta.wasConsumed ? outcome : payload,
            eventOptions,
            eventMeta: params.eventMeta,
          }));
        }
      }
      
      return vows;
    }
    
    _eventMeta.eventOrigin = eventOrigin;
    const outcome = this.__runEvent({ eventName, payload, eventOptions, eventOrigin, eventMeta: _eventMeta });
    
    if (_eventMeta.stopNow) {
      return outcome;
    } else {
      return this.__lingerEvent({
        eventName,
        payload,
        eventOptions,
        eventMeta: _eventMeta,
      });
    }
    // }
  }
  
  
  /**
   * chain listeners results
   * @param payload
   * @param newPayload
   * @return {Promise<*>}
   */
  chainCallbackPayload (payload, newPayload) {
    if (this.options.debug.all && this.options.debug.chainListenerCallbacks) {
      conGrp(`[em-async-events]  %c${this.options.chainCallbackPayload} %cpayload: %o \n\tnewPayload: %o`, 'color:CadetBlue;', 'color: grey;', payload, newPayload);
      conGrpEnd();
    }
    
    // see if there is any callback that already prepared the results chain if not create it
    payload = (payload && _.isArray(payload.$results$) && payload || { $results$: [] });
    payload.$results$.push(newPayload);
    return payload;
  }
  
  
  /**
   * remove event from events object
   * @param eventName
   */
  eraseEvent (eventName) {
    if (!_.isEmpty(this.listenersStore)) {
      if (_.isArray(eventName)) {
        for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
          this.__removeAllListeners({ eventName: eventName[eventIndex] });
        }
      } else {
        this.__removeAllListeners({ eventName });
      }
    }
  }
  
  
  /**
   * unsubscribe from subscriptions
   * @param {number|string|undefined} [subscriberID]
   * @param {string} [eventName] {string|Array<string>|undefined} - event name of events/listeners to unsubscribe
   * @param {function} [callback] {Function|Array<Function>|undefined} the callback/Array of callbacks that should be unsubscribed
   */
  fallSilent (subscriberID, eventName, callback) {
    // console.debug(`[em-async-events]-205: fallSilentProp () subscriberID: %o, eventName: %o, callback: %o`, subscriberID, eventName, callback);
    // todo add lingering events fallSilent. if event was declared with a fallSilent option, then we could also destroy it here
    if (!_.isEmpty(this.listenersStore)) {
      // Unsubscribe component from specific event
      if (!callback && typeof eventName === 'string' && eventName in this.listenersStore) {
        // console.debug(`[em-async-events]-210: fallSilentProp() - Unsubscribe component from specific event: %o`, this);
        this.__removeListeners({ eventName, subscriberID });
        
        return;
      }
      
      // Unsubscribe component from specific events
      if (!callback && _.isArray(eventName)) {
        // console.debug(`[em-async-events]-218: fallSilentProp() - Unsubscribe component from specific events: %o`, this);
        
        for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
          this.__removeListeners({ eventName: eventName[eventIndex], subscriberID });
        }
        
        return;
      }
      
      // Remove array of callbacks for specific event
      if (_.isArray(callback) && this.hasListener(eventName)) {
        // console.debug(`[em-async-events]-229: fallSilentProp() - Remove array of callbacks for specific event: %o`, this);
        
        for (let callbackIndex = 0, _len4 = callback.length; callbackIndex < _len4; callbackIndex++) {
          this.__removeCallbacks({ eventName, subscriberID, callback: callback[callbackIndex] });
        }
        
        return;
      }
      
      // Remove specific callback for specific event
      if (callback && this.hasListener(eventName)) {
        // console.debug(`[em-async-events]-240: fallSilentProp() - Remove specific callback for specific event: %o`, this);
        
        this.__removeCallbacks({ eventName, subscriberID, callback });
        
        return;
      }
      
      // remove all events in component, since no eventName or callback specified; done automatically
      if (!eventName && !callback) {
        // console.debug(`[em-async-events]-249: fallSilentProp() - remove all events in component: %o, since no eventName or callback specified; done automatically.`, subscriberID);
        for (let eventName in this.listenersStore) {
          this.__removeListeners({ eventName, subscriberID });
        }
      }
    }
  }
  
  
  /**
   * check to see if we have any listener for the given eventID
   * @param {string} [eventID] - event id to check
   * @param {object} store - store that we should check from
   * @return {boolean}
   */
  hasListener (eventID, store = this.listenersStore) {
    return this.__storeHas(store, eventID);
  }
  
  
  /**
   * check to see if we have any listener for any of the given eventID(s)
   * @param {Array<string>|string} [eventIDs] - event ids or just a single event id to check
   * @param {object} store - store that we should check from
   * @return {boolean}
   */
  hasListeners (eventIDs, store = this.listenersStore) {
    return this.__storeHas(store, eventIDs);
  }
  
  
  /**
   * check to see if we have any lingeringEvent for the given eventID
   * @param {string} [eventID] - event id to check
   * @param {object} [store] - store that we should check from
   * @return {boolean}
   */
  hasLingeringEvent (eventID, store = this.lingeringEventsStore) {
    return this.__storeHas(store, eventID);
  }
  
  
  /**
   * check to see if we have any lingering events for any of the given eventID(s)
   * @param {Array<string>|string} [eventIDs] - event ids or just a single event id to check
   * @param {object} [store] - store that we should check from
   * @return {boolean}
   */
  hasLingeringEvents (eventIDs, store = this.lingeringEventsStore) {
    return this.__storeHas(store, eventIDs);
  }
  
  
  listeners (eventIDs) {
    return _.flatten(_.values(this.__storeGet(this.listenersStore, eventIDs)));
  }
  
  
  lingeringEvents (eventIDs) {
    return _.flatten(_.values(this.__storeGet(this.lingeringEventsStore, eventIDs)));
  }
  
  
  eventConsumers (event) {
    return this.__eventConsumersAtState(event);
  }
  
  
  pendingEventConsumers (event) {
    return this.__eventConsumersAtState(event, PENDING);
  }
  
  
  resolvedEventConsumers (event) {
    return this.__eventConsumersAtState(event, RESOLVED);
  }
  
  
  rejectedEventConsumers (event) {
    return this.__eventConsumersAtState(event, REJECTED);
  }
  
  
  /**
   * check if given store has the given subjects and that they are not empty
   * @param {object} store - the store to check
   * @param {string|array<string>} [subjects] - subjects to check. Just eventIDs. If undefined or empty then it checks if store is empty.
   * @return {boolean}
   * @private
   */
  __storeHas (store, subjects) {
    if (!subjects) return !_.isEmpty(store);
    if (!_.isArray(subjects)) subjects = [subjects];
    return subjects.some(eid => !_.isEmpty(_.get(store, eid)));
  }
  
  
  /**
   * get store subjects
   * @param {object} store - the store to check
   * @param {string|array<string>} [subjects] - subjects to check. Just eventIDs. If undefined or empty then it checks if store is empty.
   * @return {PartialObject<Object>}
   * @private
   */
  __storeGet (store, subjects) {
    if (!subjects) return [];
    if (!_.isArray(subjects)) subjects = [subjects];
    return _.pick(store, subjects);
  }
  
  
  // noinspection JSUnusedGlobalSymbols
  /**
   * install plugin
   * @param Vue
   * @param options
   */
  install (Vue, options) {
    this.options = _.defaultsDeep(options, this.options);
    
    // turn off debugging if we are not going to show devtools/in production
    // noinspection JSUnresolvedVariable
    if (!Vue.config.devtools) this.options.debug.all = false;
    
    let asyncEventsProp = this.options.asyncEvents;
    let onEventProp = this.options.onEvent;
    let onceEventProp = this.options.onceEvent;
    let emitEventProp = this.options.emitEvent;
    let eraseEventProp = this.options.eraseEvent;
    let fallSilentProp = this.options.fallSilent;
    let chainCallbackPayloadProp = this.options.chainCallbackPayload;
    let hasListenerProp = this.options.hasListener;
    let hasListenersProp = this.options.hasListeners;
    let hasLingeringEventProp = this.options.hasLingeringEvent;
    let hasLingeringEventsProp = this.options.hasLingeringEvents;
    
    const AE_this = this;
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * mix into vue
     */
    Vue.mixin({
      data () {
        return {
          toFallSilent$: true,
        };
      },
      
      computed: {
        // todo document the following 2 getters
        /**
         * get component local listeners
         * @return {{}}
         */
        $localListeners () {
          return _.reduce(AE_this.listenersStore, (acc, lis, k) => {
            // noinspection JSUnresolvedVariable
            const lolis = lis.filter(lol => lol.subscriberID === this._uid);
            if (lolis.length) acc[k] = lolis;
            return acc;
          }, {});
        },
        /**
         * get component local Lingered Events
         * @return {{}}
         */
        $localLingeredEvents () {
          return _.reduce(AE_this.lingeringEventsStore, (acc, ev, k) => {
            // noinspection JSUnresolvedVariable
            const loev = ev.filter(loe => loe.eventMeta.emitterID === this._uid);
            if (loev.length) acc[k] = loev;
            return acc;
          }, {});
        },
      },
      
      beforeDestroy: function asyncEventsBeforeDestroy () {
        // noinspection JSUnresolvedVariable
        if (this.toFallSilent$) this[fallSilentProp]();
      },
    });
    
    // noinspection JSUnresolvedVariable
    /**
     * plugin local state
     */
    Vue.prototype[asyncEventsProp] = {
      listeners:            this.listenersStore,
      localListeners:       this.$localListeners,
      lingeringEvents:      this.lingeringEventsStore,
      localLingeringEvents: this.$localLingeringEvents,
      options:              this.options,
      
      /**
       * check if Async Events has any listeners for the given eventID
       * @param {string} eventID - the listener eventID to check.
       * @return {boolean}
       */
      hasListener (eventID) {
        return AE_this.hasListener(eventID);
      },
      /**
       * check if Async Events has any listeners for the given eventIDs
       * @param {array<string>|string} eventIDs - the listener eventIDs to check.
       * @return {boolean}
       */
      hasListeners (eventIDs) {
        return AE_this.hasListeners(eventIDs);
      },
      /**
       * check if Async Events has any lingering events for the given eventID
       * @param {string} eventID - the eventID to check.
       * @return {boolean}
       */
      hasLingeringEvent (eventID) {
        return AE_this.hasLingeringEvent(eventID);
      },
      /**
       * check if Async Events has any lingering events for the given eventIDs
       * @param {array<string>|string} eventIDs - the eventIDs to check.
       * @return {boolean}
       */
      hasLingeringEvents (eventIDs) {
        return AE_this.hasLingeringEvents(eventIDs);
      },
    };
    
    /**
     * add event listener
     * @param eventName
     * @param callback
     * @param listenerOptions
     */
    Vue.prototype[onEventProp] = function (eventName, callback, listenerOptions) {
      // noinspection JSUnresolvedVariable
      return AE_this.onEvent(eventName, callback, listenerOptions, this._uid, this);
    };
    
    
    /**
     * add event listener that only listens for event once and removed once executed
     * @param eventName
     * @param callback
     * @param listenerOptions
     */
    Vue.prototype[onceEventProp] = function (eventName, callback, listenerOptions) {
      // noinspection JSUnresolvedVariable
      return AE_this.onceEvent(eventName, callback, listenerOptions, this._uid, this);
    };
    
    /**
     * emit event and run callbacks subscribed to the event
     * @param eventName
     * @param payload
     * @param eventOptions
     * @return {Promise<*>|array<Promise>}
     */
    Vue.prototype[emitEventProp] = function (eventName, payload, eventOptions) {
      // noinspection JSUnresolvedVariable
      return AE_this.emitEvent(eventName, payload, eventOptions, this._uid, this);
    };
    
    
    /**
     * chain listeners results
     * @param payload
     * @param newPayload
     * @return {Promise<*>}
     */
    Vue.prototype[chainCallbackPayloadProp] = function (payload, newPayload) {
      return AE_this.chainCallbackPayload(payload, newPayload);
    };
    
    /**
     * remove event from events object
     * @param eventName
     */
    Vue.prototype[eraseEventProp] = function (eventName) {
      return AE_this.eraseEvent(eventName);
    };
    
    /**
     * unsubscribe from subscriptions
     * @param eventName {string|Array<string>|undefined} - event name of events/listeners to unsubscribe
     * @param callback {Function|Array<Function>|undefined} the callback/Array of callbacks that should be unsubscribed
     */
    Vue.prototype[fallSilentProp] = function (eventName, callback) {
      // noinspection JSUnresolvedVariable
      return AE_this.fallSilent(this._uid, eventName, callback);
    };
    
    
    /**
     * check to see if the component has any listeners for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @param {object} source - async listeners or lingering events to check for existence from.
     * @param {string} origin - the origin to use (eventOrigin for lingeringEvents and listenerOrigin for events)
     * @param {object} vm - the Vue component to check on
     * @return {boolean}
     */
    function checkComponentEvents (eventIDs, source, origin, vm) {
      if (!eventIDs) return false;
      if (!_.isArray(eventIDs)) eventIDs = [eventIDs];
      let listeners = _.flatten(_.filter(source, (v, k) => eventIDs.includes(k)));
      // noinspection JSUnresolvedVariable
      listeners = _.filter(listeners, (listener) => _.get(listener, `${origin}._uid`) === vm._uid);
      return !!listeners.length;
    }
    
    
    /**
     * check to see if component has any listener for the given eventID
     * @param {string} eventID - event id to check
     * @return {boolean}
     */
    Vue.prototype[hasListenerProp] = function (eventID) {
      return checkComponentEvents(eventID, AE_this.listenersStore, 'listenerOrigin', this);
    };
    /**
     * check to see if the component has any listeners for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @return {boolean}
     */
    Vue.prototype[hasListenersProp] = function (eventIDs) {
      return checkComponentEvents(eventIDs, AE_this.listenersStore, 'listenerOrigin', this);
    };
    
    
    /**
     * check to see if we have any lingeringEvent for the given eventID
     * @param {string} eventID - event id to check
     * @return {boolean}
     */
    Vue.prototype[hasLingeringEventProp] = function (eventID) {
      return checkComponentEvents(eventID, AE_this.lingeringEventsStore, 'eventMeta.eventOrigin', this);
    };
    /**
     * check to see if we have any lingering event for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @return {boolean}
     */
    Vue.prototype[hasLingeringEventsProp] = function (eventIDs) {
      return checkComponentEvents(eventIDs, AE_this.lingeringEventsStore, 'eventMeta.eventOrigin', this);
    };
  }
  
  
  
  // Privates
  
  /**
   * Add event listener
   * @param eventName
   * @param callback
   * @param listenerOptions
   * @param subscriberID
   * @param listenerOrigin
   * @param racingListeners
   * @return {Promise}
   */
  __addListener ({ eventName, callback, listenerOptions, subscriberID, listenerOrigin, racingListeners }) {
    const originStack = _.pick(lineStack.skipByFilename('em-async-events'), ['filename', 'method', 'line']);
    
    let isExclusiveCallbackListener = false;
    
    listenerOptions.originStack = originStack;  // to be deprecated in favour of (listener||listenerMeta).originStack
    
    /** backwards compatibility */
    if (!!listenerOptions.expire && !listenerOptions.timeout) listenerOptions.timeout = listenerOptions.expire;
    // noinspection JSUnresolvedVariable
    if (!!listenerOptions.expiryCallback && !listenerOptions.timeoutCallback) listenerOptions.timeoutCallback = listenerOptions.expiryCallback;
    
    // todo move this to a method and fix this to work correctly for callbacks...
    const exclusiveListener = (this.listenersStore[eventName] || []).find(l => {
      return this.__isExclusiveListener(l, subscriberID, listenerOptions) || this.__isExclusiveCallback(callback, l, subscriberID, listenerOptions) && (isExclusiveCallbackListener = true);
    });
    
    // bailout if there is an exclusive listener of the same event name on the component
    if (exclusiveListener) {
      if (!isExclusiveCallbackListener && !listenerOptions.replace || isExclusiveCallbackListener && !listenerOptions.callbacks.replace) {
        if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace || listenerOptions.verbose) {
          conGrp(`[em-async-events] %cABORTING (exclusive ${(isExclusiveCallbackListener ? 'callback' : 'listener')} exists) ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent} %ceventName: %o Exclusive Listener Origin: %o, Requesting Origin: %o`, 'color:brown;', 'color: grey;', eventName, _.get(exclusiveListener.listenerOrigin, '$options.name', '???'), _.get(listenerOrigin, '$options.name', '???'));
          // if (listenerOptions.verbose)
          console.warn(`Exclusive Listener: %o, \n\toriginStack: %o`, exclusiveListener, originStack);
          conGrpEnd();
        }
        throw new Error(`[index]-595: __addListener("${eventName}") - ABORTING (exclusive ${(isExclusiveCallbackListener ? 'callback' : 'listener')} exists in "${_.get(exclusiveListener.listenerOrigin, '$options.name', exclusiveListener.originStack)}")`);
      } else {
        conGrp(`[em-async-events] %cREPLACING existing listener %c- eventName: %o because of exclusivity options...`, 'color: brown;', 'color: grey;', eventName);
        console.warn(`listenerOptions: %o \n\toriginStack: %o`, listenerOptions, originStack);
        conGrpEnd();
      }
    }
    
    // todo we can add level to add listener options for non-vue usage
    const level = listenerOrigin ? this.__getOriginLevel(listenerOrigin) : 0;
    
    // todo test and doc debounce callback using lodash debounce if debounce is specified in options. debounce: {wait,leading,trailing, maxWait}
    if (_.isObject(listenerOptions.callbacks.debounce)) {
      const de = listenerOptions.callbacks.debounce;
      callback = _.debounce(_.get(exclusiveListener, 'callback', callback), de.wait, {
        leading:  de.leading,
        trailing: de.trailing,
        maxWait:  de.maxWait,
      });
    } else if (_.isObject(listenerOptions.callbacks.throttle)) {
      // todo test and doc throttle callback using lodash throttle if throttle is specified in options. throttle: {wait,leading,trailing}
      const th = listenerOptions.callbacks.throttle;
      callback = _.throttle(_.get(exclusiveListener, 'callback', callback), th.wait, {
        leading:  th.leading,
        trailing: th.trailing,
      });
    }
    
    // create a promise that can be waited for by listener, this is the first callbackPromise,
    const listenerPromise = this.__createPromise();
    
    // create listener object
    /**
     * @typedef {
     *  {
     *    originStack: PartialObject<{file: string, filename: string, method: string, line: number, callSites: CallSite[]}|void>,
     *    level: (number|number),
     *    calls: CallbackPromise[],
     *    racingListeners: Listener[],
     *    listenerOrigin: {object},
     *    eventName: string,
     *    callback: Function,
     *    subscriberID: string,
     *    listenerOptions: ListenerOptions,
     *    id: string,
     *    timestamp: number
     *  }
     *} Listener
     */
    /** @type Listener */
    const listener = {
      eventName,
      callback:  _.get(exclusiveListener, 'callback', callback),
      listenerOptions,
      racingListeners,
      subscriberID,
      listenerOrigin,
      originStack,
      id:        this.__genUniqID(),
      level,
      timestamp: Date.now(),
      timeout:   undefined,
      calls:     [listenerPromise],
      listenerPromise,
    };
    
    if (listenerOptions.timeout) {
      this.__instantiateListenerTimeout(listener);
    }
    
    if (!!racingListeners) racingListeners[eventName] = listener;
    
    if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace || listenerOptions.verbose) {
      conGrp(`[em-async-events] %c${listenerOptions.once ? this.options.onceEvent : this.options.onEvent} %c(addListener) - eventName: %o origin: %o - level: %o`, 'color: green', 'color: grey;', eventName, _.get(listenerOrigin, '$options.name', '???'), level);
      if (listenerOptions.verbose) console.warn(`Listener: %o \n\toriginStack: %o`, listener, originStack);
      conGrpEnd();
    }
    
    // results that happen here will be sent thru the listener promise chain.
    this.__invokeLingeredEventsAtAddListener({ eventName, listener });
    
    // only add to listeners if it's not once or isn't settled yet.
    if (!listenerOptions.once || listener.calls[0].settlement === PENDING) {
      this.__stashListenerOrEvent(listener, eventName, this.listenersStore, exclusiveListener);
    }
    
    // console.debug(`[index]-622: __addListener() - listener subscriberID: %o, outcome: %o, settlement: %o`, listener.subscriberID, listener.calls[0].outcome, listener.calls[0].settlement);
    return listener.calls[0];
  }
  
  
  /**
   * instantiate listener timeout based on listener options
   * @param listener
   * @private
   * @return {Timeout} listener timeout object
   */
  __instantiateListenerTimeout (listener) {
    const { listenerOptions, eventName } = listener;
    
    listener.timeout = Timeout.instantiate(listener.id, async () => {
      let hasCB = _.isFunction(listenerOptions.timeoutCallback);
      if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace || listenerOptions.verbose) {
        conGrp(`[em-async-events] %c${listenerOptions.once ? 'one-time' : 'regular'} eventName: %o TIMED OUT %c- ${hasCB ? 'called CB' : 'with no timeoutCallback'}...`, 'color:brown;', eventName);
        console.warn(`Listener: %o \n\toriginStack: %o`, listener, listener.originStack);
        conGrpEnd();
      }
      
      if (hasCB) await listenerOptions.timeoutCallback(listener);
      
      if (listenerOptions.throwOnTimeout) {
        this.__rejectCallbackPromise(listener, `Event "${eventName}" timed out!`);
      }
      
      // noinspection JSCheckFunctionSignatures
      if (listenerOptions.once) {
        this.__removeListeners({ ...listener });
      } else {
        // re-instantiate timeout
        listener.timeout.reset();
      }
    }, listenerOptions.timeout);
    
    return listener.timeout;
  }
  
  
  __clearOrResetTimeout (listener) {
    if (listener.timeout) {
      if (listener.listenerOptions.once) listener.timeout.clear();
      else listener.timeout.reset();
    }
  }
  
  
  /**
   * check if listener is exclusive
   * @param listener
   * @param subscriberID
   * @param listenerOptions
   * @return {*|boolean|boolean}
   * @private
   */
  __isExclusiveListener (listener, subscriberID, listenerOptions) {
    // the one being added is the global exclusive listener so we have a hit
    if (listener.listenerOptions.isGloballyExclusive || listenerOptions.isGloballyExclusive) return true;
    
    return (listener.listenerOptions.isLocallyExclusive || listenerOptions.isLocallyExclusive) && listener.subscriberID === subscriberID;
  }
  
  
  /**
   * check if this is an exclusive callback
   * @param callback
   * @param listener
   * @param subscriberID
   * @param listenerOptions
   * @return {false|*|boolean}
   * @private
   */
  __isExclusiveCallback (callback, listener, subscriberID, listenerOptions) {
    return callback === listener.callback && this.__isExclusiveListenerCallback(listener, subscriberID, listenerOptions);
  }
  
  
  /**
   * check if listener callback is exclusive
   * @param listener
   * @param subscriberID
   * @param listenerOptions
   * @return {false|*|boolean|boolean}
   * @private
   */
  __isExclusiveListenerCallback (listener, subscriberID, listenerOptions) {
    return (listener.listenerOptions.callbacks.isGloballyExclusive || listenerOptions.callbacks.isGloballyExclusive) ||
        (listener.listenerOptions.callbacks.isLocallyExclusive || listenerOptions.callbacks.isLocallyExclusive) && listener.subscriberID === subscriberID;
  }
  
  
  /**
   * Run event callbacks
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @param eventMeta
   * @return {Promise}
   */
  __runEvent ({ eventName, payload, eventOptions, eventOrigin, eventMeta }) {
    /** run event */
    const level = this.__getOriginLevel(eventOrigin);
    let listeners = this.listenersStore[eventName];
    let listenersTally = listeners && listeners.length;
    let stop;
    
    _.merge(eventMeta, {
      id:             this.__genUniqID(),
      eventName,
      consumers:      [],
      eventTimestamp: Date.now(),
      eventOptions:   cloneDeep(eventOptions),
      level,
      listenersTally,
    });
    
    if (!!eventOrigin) {
      ({ listeners, stop } = this.__getListenersInRange({
        listeners,
        eventName,
        payload,
        eventOptions,
        eventOrigin,
        eventMeta,
        eventLevel: level,
      }));
    }
    
    if (this.options.debug.all && this.options.debug.emitEvent || eventOptions.trace || eventOptions.verbose) {
      conGrp(`[em-async-events] %c${this.options.emitEvent} %ceventName: %o, origin: %o - level: %o, range: %o, \n\tpayload: %o`, 'color: green', 'color: grey;', eventName, _.get(eventOrigin, '$options.name', '???'), level, eventOptions.range, payload);
      if (eventOptions.verbose) console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
      conGrpEnd();
    }
    
    const outcome = this.__runListeners({
      listeners, eventName, payload, eventOptions, eventOrigin, eventMeta, stop,
    });
    
    if (!eventMeta.wasConsumed) {
      if (this.options.debug.all && this.options.debug.emitEvent || eventOptions.trace || eventOptions.verbose) {
        conGrp(`[em-async-events] %ceventName: %o wasn't consumed! %cCheck the event name correctness, or adjust its "linger" time or the listeners' "catchup" time to bust event race conditions.`, 'color:brown;', eventName, 'color: grey;');
        console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
        conGrpEnd();
      }
      
      // todo use createPromise promise.resolve()/reject() then return the promise object for all returned promises to maintain a uniform response. make a __resolvePromise, __rejectPromise private method that handles these
      if (eventOptions.rejectUnconsumed) return Promise.reject(`Event "${eventName}" NOT consumed!`);
      else return Promise.resolve();
    } else {
      return Promise.resolve(outcome);
    }
  }
  
  
  /**
   *
   * @param listeners
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @param eventMeta
   * @param [stop] {boolean|null}
   * @return {Promise<*>}
   * @private
   */
  async __runListeners ({
                          listeners,
                          eventName,
                          payload,
                          eventOptions,
                          eventOrigin,
                          eventMeta,
                          stop,
                        }) {
    let finalOutcome;
    let listenersTally = listeners && listeners.length;
    
    // console.debug(`[em-async-events] index-564: - eventName: %o, \n\teventOrigin: %o, \n\t_listeners: %o\n\teventMeta: %o`, eventName, eventOrigin, listeners, eventMeta);
    
    if (listenersTally) {
      let stopHere = false;
      
      // sort them out according to age specs if there.
      if (!!(eventOptions.range || '').match(/oldest|youngest/i)) {
        listeners = _.sortBy(listeners, ['timestamp']);  // sort ascending order from oldest to newest
        if (!!eventOptions.range.match(/youngest/i)) listeners = _.reverse(listeners);
        
        if (!eventOptions.range.match(/from/i)) {
          let ls = [];
          if (!!eventOptions.range.match(/youngest/i)) {
            ls.push(_.first(listeners));
            if (!!eventOptions.range.match(/oldest/i)) ls.push(_.last(listeners));
          } else ls.push(_.first(listeners));
          listeners = ls;
        }
      }
      
      
      // todo run listeners using eventIndex, starting closest, up and down... this is why the while loop was there.
      // run both up and down listeners (which ever is available)
      for (let listener of listeners) {
        if (stop || listener.listenerOptions.stopHere) stopHere = true;
        
        if (this.options.debug.all && this.options.debug.invokeListener || listener.listenerOptions.trace || eventOptions.verbose || listener.listenerOptions.verbose) {
          conGrp(`[em-async-events] %c${listener.listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(Invoke Listener Callback) %c- eventName: %o, payload: %o, \n\tlistener origin: %o - level: %o, \n\teventOrigin: %o - level: %o,\n\toutcome: %o, stoppingHere: %o`, 'color: green', 'color: grey;', eventName, payload, _.get(listener.listenerOrigin, '$options.name', '???'), listener.level, _.get(eventOrigin, '$options.name', '???'), eventMeta.level, finalOutcome, stopHere);
          if (eventOptions.verbose || listener.listenerOptions.verbose) {
            console.warn(`Listener: %o \n\toriginStack: %o`, listener, listener.originStack);
            if (!eventOptions.trace && !eventOptions.verbose) {
              // show event info if we event didn't
              console.debug(`%c Event: %ceventName: %o, origin: %o - level: %o, range: %o, \n\teventMeta: %o \n\toriginStack: %o`, 'color: green', 'color: grey;', eventName, _.get(eventOrigin, '$options.name', '???'), eventMeta.level, eventOptions.range, eventMeta, eventMeta.originStack);
            }
          }
          conGrpEnd();
        }
        
        if (_.isFunction(listener.listenerOptions.predicate)) {
          try {
            if (!(await listener.listenerOptions.predicate(payload, this.__callbackMeta(listener, undefined, eventMeta)))) {
              // todo log what just happened
              continue;
            }
          } catch (e) {
            // console.debug(`{dim [index/__runListeners()]-983:} e: %o`, e);
            this.removeOtherRacingListenersCallbacks(listener, eventName);
            this.__rejectCallbackPromise(listener, e);
            return finalOutcome;
          }
        }
        
        this.removeOtherRacingListenersCallbacks(listener, eventName);
        
        this.__clearOrResetTimeout(listener);
        
        const callbackPromise = listener.calls[0].wasInvoked ? this.__createPromise() : listener.calls[0];
        try {
          if (_.isFunction(listener.callback)) {
            //  check if calls has anything and if we should be doing serial execution
            if (listener.calls.length && listener.listenerOptions.callbacks.serialExecution) {
              finalOutcome = Promise.all(listener.calls)
                                    .then((outcome) => {
                                      // todo how should we use outcome here?
                                      return this.__runCallbackPromise(listener, callbackPromise, payload, eventMeta);
                                    });
            } else {
              finalOutcome = this.__runCallbackPromise(listener, callbackPromise, payload, eventMeta);
            }
            
            if (eventMeta.eventOptions.chain) payload = finalOutcome; // todo shouldn't this be listener.listenerOptions.chain?
          }
          
          // check if the initial listener callback promise (this tracks the listener promise returned to (on|once)Event) is still pending
          // once listeners only have one calls, so listener.calls[0] and callbackPromise is the same thing always for them
          if (listener.listenerOptions.once && callbackPromise.settlement !== PENDING) {
            this.__removeCallbacks({ eventName, subscriberID: listener.subscriberID, callback: listener.callback });
          }
        } catch (e) {
          // todo error handling, not working because the promise is not being waited for, it's just collecting info and returning that info without waiting, so error happens elsewhere
          this.__rejectCallbackPromise(listener, e, callbackPromise, finalOutcome);
        }
        
        
        if (stopHere) {
          eventMeta.stopNow = true;
          break;
        }
      }
    }
    
    return finalOutcome;
  }
  
  
  /**  __removeListeners for all racingListeners associated with this listener */
  removeOtherRacingListenersCallbacks (listener, eventName) {
    if (listener.listenerOptions.race) {
      _.forEach(listener.racingListeners,
          /**
           * @param l {object}
           * @param k {string}
           */ (l, k) => {
            if (k !== eventName && !!l) {
              // todo log what just happened
              this.__removeCallbacks({ eventName: k, subscriberID: l.subscriberID, callback: listener.callback });
              this.__clearOrResetTimeout(l);
            }
          },
      );
    }
  }
  
  
  /**
   * Reject a given callbackPromise
   * @private
   * @param listener
   * @param err
   * @param [callbackPromise] {CallbackPromise} if none is provided then it uses listener.calls[0]
   * @param [finalOutcome]
   */
  __rejectCallbackPromise (listener, err, callbackPromise, finalOutcome) {
    if (!callbackPromise) {
      callbackPromise = listener.calls[0];
    }
    
    if (callbackPromise) {
      callbackPromise.settlement = REJECTED;
      callbackPromise.outcome = finalOutcome;
      if (listener.listenerOptions.once) {
        this.__removeCallbacks({
          eventName:    listener.eventName,
          subscriberID: listener.subscriberID,
          callback:     listener.callback,
        });
      }
      callbackPromise.reject(err);
    }
  }
  
  
  /**
   * run listener callback promise
   * @param listener
   * @param callbackPromise {CallbackPromise}
   * @param payload
   * @param eventMeta
   * @return {*}
   * @private
   */
  __runCallbackPromise (listener, callbackPromise, payload, eventMeta) {
    if (listener.calls[0].wasInvoked) listener.calls.push(callbackPromise);
    callbackPromise.wasInvoked = true;
    
    // todo should we replace exclusive listeners?
    // const exclusiveListener = this.__getExclusiveListener(listener.eventName, this.listenersStore); // todo ???
    
    // keep track of lingering event listeners where we can track them in userland. todo clean all resolved listeners when we reach maxCacheCount (rename maxCachedPayloads to this and reuse everywhere we need cache things (Infinite events can gobble memory if uncleared))
    //  todo create userland utils to check events and listeners promise statuses.
    eventMeta.consumers.push(listener);
    
    /** do the actual call of the callback */
    let finalOutcome = listener.callback(payload, this.__callbackMeta(listener, callbackPromise, eventMeta));
    
    if (!_.isUndefined(listener.listenerOptions.extra)) {
      eventMeta.extras.push(listener.listenerOptions.extra);
    }
    
    
    if (isPromise(finalOutcome)) {
      // todo check error handling of promise here
      return finalOutcome.then((outcome) => {
        if (listener.listenerOptions.once) this.__removeListeners({ ...listener });
        return this.__settleCallbackPromise(listener, callbackPromise, outcome, eventMeta);
      });
    } else {
      return this.__settleCallbackPromise(listener, callbackPromise, finalOutcome, eventMeta);
    }
  }
  
  
  /**
   * get callback meta data that should be passed to callback functions
   * @param listener
   * @param callbackPromise
   * @param eventMeta
   * @returns {{eventMeta, extra: (string|Record<string, any>|*), listenerMeta, call_id}}
   * @private
   */
  __callbackMeta (listener, callbackPromise, eventMeta) {
    return {
      extra:        listener.listenerOptions.extra,
      eventMeta,
      listenerMeta: listener,
      call_id:      !!callbackPromise && callbackPromise.id,
    };
  }
  
  
  /**
   * Settle callback promise
   * @param listener
   * @param callbackPromise {CallbackPromise}
   * @param outcome
   * @param eventMeta
   * @return {*}
   * @private
   */
  __settleCallbackPromise (listener, callbackPromise, outcome, eventMeta) {
    // only capture the first outcome becoz that's what promises do, once resolved or rejected it's settled.
    callbackPromise.settlement = RESOLVED;
    callbackPromise.outcome = outcome;
    callbackPromise.resolve(outcome);
    
    return outcome;
  }
  
  
  
  /**
   * linger a given event it it's lingerable
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventMeta
   */
  __lingerEvent ({ eventName, payload, eventOptions, eventMeta }) {
    if (eventOptions.linger <= 0 && eventOptions.linger !== false && this.options.eventsOptions.linger > 0) {
      eventOptions.linger = this.options.eventsOptions.linger;
    }
    
    if (eventOptions.linger > 0) {
      // todo make sure this work properly; it should consider existing events as well.
      // get existing exclusive lingered event
      let exclusiveLingeredEvent = this.__getExclusiveEvent(eventMeta, this.lingeringEventsStore);
      
      // bailout if exclusive lingered event is set to be kept (meaning don't replace with fresh event)
      if (exclusiveLingeredEvent) {
        if (!eventOptions.replace) {
          if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace || eventOptions.verbose) {
            conGrp(`[em-async-events] %cDISCARDING EXCLUSIVE lingered event %c- eventName: %o`, 'color: brown;', 'color: grey;', eventName);
            console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
            conGrpEnd();
          }
          
          return this.__settleLingeredEvent(exclusiveLingeredEvent, eventOptions, eventName);
        } else if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace || eventOptions.verbose) {
          conGrp(`[em-async-events] %cREPLACING EXCLUSIVE lingered event %c- eventName: %o`, 'color: brown;', 'color: grey;', eventName);
          console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
          conGrpEnd();
        }
        
        // since this is to be replaced we need to clear the timeout
        exclusiveLingeredEvent.lingeringEventPromise.timeout.clear();
      }
      
      // bailout if baited but consumed event
      if (eventMeta.wasConsumed && eventOptions.bait) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace || eventOptions.verbose) {
          conGrp(`[em-async-events] %cABORTING event lingering %c- event was BAITED, but consumed already - eventName: %o`, 'color: brown;', 'color: grey;', eventName);
          console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
          conGrpEnd();
        }
        
        return Promise.resolve(payload);
      }
      
      if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace || eventOptions.verbose) {
        conGrp(`[em-async-events] %cLingering event %c- eventName: %o for %o (ms)`, 'color: CadetBlue;', 'color: grey;', eventName, eventOptions.linger);
        if (eventOptions.verbose) console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
        conGrpEnd();
      }
      
      
      // to be resolved by run callbacks, see this.__invokeLingeredEventsAtAddListener
      const lingeringEventPromise = this.__createPromise();
      eventMeta.isLingered = true;
      const ev = {
        id: eventMeta.id,
        lingeringEventPromise,
        payload,
        eventMeta,
      };
      
      this.__stashListenerOrEvent(ev, eventName, this.lingeringEventsStore, exclusiveLingeredEvent);
      
      this.__decayLingeredEvent(ev, eventName, eventOptions, eventMeta);
      
      return ev.lingeringEventPromise;
    }
    
    if (eventMeta.wasConsumed) return _.last(_.last(eventMeta.consumers).calls);
    else if (eventOptions.rejectUnconsumed) return Promise.reject(`Un-lingered Event "${eventName}" was NOT consumed!`);
    
    return Promise.resolve();
  }
  
  
  __decayLingeredEvent (ev, eventName, eventOptions) {
    // order the splice after linger ms later
    let timeout = eventOptions.linger;
    if (timeout >= Infinity) timeout = 2147483647; // set to maximum allowed so that we don't have an immediate bailout
    
    ev.lingeringEventPromise.timeout = Timeout.instantiate(ev.eventMeta.id, (e) => {
      // todo use e instead of ev
      const consumers = this.pendingEventConsumers(ev);
      if (consumers.length) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.verbose) {
          conGrp(`[em-async-events] %ceventName: %o "linger" time has run out whilst it's still being consumed. It's removed, but its promise will be settled once the consumers finish.`, 'color: grey;', eventName);
          console.warn(`Consumers: %o, eventMeta: %o \n\toriginStack: %o`, consumers, ev.eventMeta, ev.eventMeta.originStack);
          conGrpEnd();
        }
        
        Promise.all(consumers.map(c => c.calls)).then((res) => {
          // console.debug(`[index]-1011: () - res: %o`, res);
          // todo how do we use res here
          this.__settleLingeredEvent(ev, eventOptions, eventName);
          if (consumers.length && this.options.debug.all && this.options.debug.lingerEvent || eventOptions.verbose) {
            conGrp(`[em-async-events] %ceventName: %o "linger" consumers have finished.`, 'color: grey;', eventName);
            console.warn(`Consumers: %o, eventMeta: %o \n\toriginStack: %o`, consumers, ev.eventMeta, ev.eventMeta.originStack);
            conGrpEnd();
          }
        });
      } else {
        this.__settleLingeredEvent(ev, eventOptions, eventName);
      }
      
      if (Array.isArray(this.lingeringEventsStore[eventName])) {
        const i = this.lingeringEventsStore[eventName].findIndex(le => le.id === ev.id);
        this.__removeLingeringEventAtIndex(eventName, i, eventOptions, ev.eventMeta);
      }
    }, timeout, ev);
  }
  
  
  __settleLingeredEvent (ev, eventOptions, eventName) {
    // finally resolve/reject lingering event promise
    if (ev.eventMeta.wasConsumed) {
      ev.lingeringEventPromise.resolve(_.last(_.last(ev.eventMeta.consumers).calls));
    } else {
      if (eventOptions.rejectUnconsumed) ev.lingeringEventPromise.reject(`Lingered Event "${eventName}" NOT consumed!`);
      else ev.lingeringEventPromise.resolve();
    }
    
    ev.lingeringEventPromise.timeout.clear();
  }
  
  
  __eventConsumers (ev) {
    if (!_.isArray(ev)) ev = [ev];
    return _.flatten(ev.map(l => l.eventMeta.consumers));
  }
  
  
  __eventConsumersAtState (ev, state) {
    const consumers = this.__eventConsumers(ev);
    if (_.isNil(state)) return consumers;
    return consumers.filter(con => con.calls.some(c => c.settlement === state));
  }
  
  
  /**
   * Stash the subject (listener or lingering event) into their respective stores.
   * - if the event is exclusive then it will be replaced by the new subject
   * @param {object} subject - the event or listener to stash
   * @param {string} subjectID - event id
   * @param {object} store - the store to use (this.listenersStore or this.lingeringEventsStore)
   * @param {object} [exclusive] - exclusive subject that we found already in the store (will be replaced by the new subject)
   * @private
   */
  __stashListenerOrEvent (subject, subjectID, store, exclusive) {
    if (!exclusive) {
      (store[subjectID] || (store[subjectID] = [])).push(subject);
    } else {
      const index = store[subjectID].findIndex(e => e.id === exclusive.id);
      store[subjectID][index] = subject;
      // todo if we update state using bait, this can create an event based state updated by emissions and read by once listeners
      //  (may actually create an easy API around this... problem is the API is based on this module ;D)
      //  you need to somehow make sure payload isn't overwritten, it should merge it.
    }
  }
  
  
  /**
   * Get the exclusive event for the given eventID
   * @param {object} eventMeta - the event meta
   * @param {string} eventMeta.eventName - the event id associated with the event we want to check exclusives for
   * @param {string} eventMeta.emitterID - the emitter id associated with the event we want to check exclusives for
   * @param {object} store - the store to get it from
   * @return {object} - the exclusive event object
   * @private
   */
  __getExclusiveEvent (eventMeta, store) {
    return (store[eventMeta.eventName] || []).find(e => e.eventMeta.eventOptions.isGloballyExclusive || e.eventMeta.eventOptions.isLocallyExclusive && e.eventMeta.emitterID === eventMeta.emitterID);
  }
  
  
  /**
   * run lingered events for listener (triggered during add listener)
   * @param eventName
   * @param listener
   */
  __invokeLingeredEventsAtAddListener ({ eventName, listener }) {
    // console.debug(`[index]-908: __invokeLingeredEventsAtAddListener() - listener subscriberID: %o, hasLingeringEvent? %o, catchup? %o`, listener.subscriberID, this.hasLingeringEvents(eventName), !!listener.listenerOptions.catchup);
    // check if listener has an events lingering for it, if so then trigger these events on listener to handle
    if (!!listener.listenerOptions.catchup && this.hasLingeringEvents(eventName)) {
      for (let ei in this.lingeringEventsStore[eventName]) {
        // noinspection JSUnfilteredForInLoop
        const lingeringEvent = this.lingeringEventsStore[eventName][ei];
        let { payload, eventMeta } = lingeringEvent;
        
        // is listener catchup within range?
        const elapsed = Date.now() - eventMeta.eventTimestamp;
        const { eventOptions, eventOrigin } = eventMeta;
        if (listener.listenerOptions.catchup === true || listener.listenerOptions.catchup >= elapsed) {
          
          if (this.options.debug.all && this.options.debug.addListener || listener.listenerOptions.trace || listener.listenerOptions.verbose || eventOptions.verbose) {
            conGrp(`[em-async-events] %ccatchup - %c"catching up" to a currently lingering lingeringEvent "%o" that has been lingering for %o/%o.`, 'color: green', 'color: grey;', eventName, elapsed, eventOptions.linger);
            if (listener.listenerOptions.verbose) {
              console.warn(`listener: %o, lingeringEvent: %o \n\toriginStack: %o`, listener, lingeringEvent, listener.originStack);
            }
            conGrpEnd();
          }
          
          // the reason here is that we need it to pass thru the levels logic too
          const outcome = this.__runListeners({
            payload,
            listeners: [listener],
            eventName,
            eventOptions,
            eventOrigin,
            eventMeta,
          });
          
          if (eventMeta.wasConsumed) {
            if (eventOptions.chain) lingeringEvent.payload = outcome;
            
            // todo bait logic should be done only when all listeners have taken the bait, since we can add multiple listeners per onEvent/onceEvent
            if (eventOptions.bait) {
              // todo investigate if lingeringEventPromise is not repetition of something
              lingeringEvent.lingeringEventPromise.settlement = RESOLVED;
              lingeringEvent.lingeringEventPromise.resolve(outcome);
              // noinspection JSUnfilteredForInLoop
              this.__removeLingeringEventAtIndex(eventName, ei, eventOptions, eventMeta);
            }
          }
        } else {
          if (this.options.debug.all && this.options.debug.addListener || listener.listenerOptions.trace || listener.listenerOptions.verbose) {
            conGrp(`[em-async-events] %c${listener.listenerOptions.once ? this.options.onceEvent : this.options.onEvent} couldn't "catchup" to currently lingering event %o for %o (ms).\n\t%cPlease adjust listener options catchup time from: %o (ms) to something greater than %o (ms), if this is desired.\n<- (that's how long it's roughly taking to get to start listening, against when linger started).`, 'color: brown', eventName, eventOptions.linger, 'color: grey;', listener.listenerOptions.catchup, elapsed);
            if (listener.listenerOptions.verbose) console.warn(`Listener: %o \n\toriginStack: %o`, listener, listener.originStack);
            conGrpEnd();
          }
        }
      }
    }
  }
  
  
  __removeLingeringEventAtIndex (eventName, index, eventOptions, eventMeta) {
    if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace || eventOptions.verbose) {
      conGrp(`[em-async-events] %cremove lingering event %c- eventName: %o on index: %o`, 'color: CadetBlue;', 'color: grey;', eventName, index);
      if (!eventMeta.wasConsumed) {
        console.warn(`Lingered eventName: %o wasn't consumed! Check the event name correctness, or adjust its "linger" time or the listeners' "catchup" time to bust event race conditions.`, eventName);
      }
      
      if (eventOptions.verbose) console.warn(`eventMeta: %o \n\toriginStack: %o`, eventMeta, eventMeta.originStack);
      conGrpEnd();
    }
    
    this.lingeringEventsStore[eventName].splice(index, 1);
    this.__cleanUpStore(this.lingeringEventsStore, eventName);
  }
  
  
  /**
   * get event components listeners in range based on event and listeners levels
   * @param eventName
   * @param eventMeta
   * @param eventOptions
   * @param eventOrigin
   * @param listeners
   * @param eventLevel
   * @return {{stop:boolean|null, listeners: object[]}}
   */
  __getListenersInRange ({ eventName, eventMeta, eventOptions, eventOrigin, listeners, eventLevel }) {
    let
        /**
         * use listeners going up
         * @type {number|null}
         */
        up = null,
        /**
         * use listeners going down
         * @type {number|null}
         */
        down = null,
        /**
         * stop at the first listener
         * @type {boolean|null}
         */
        stop = null,
        /**
         * serve listeners in the same component as emitter ONLY
         * @type {boolean|null}
         */
        selfOnly = null,
        /**
         * serve listeners in the same component as emitter AS WELL
         * @type {boolean|null}
         */
        self = null,
        /**
         * serve listeners on the same component as emitter ONLY
         * @type {boolean|null}
         */
        siblings = null;
    
    const lr = (eventOptions.range && eventOptions.range.replace(/(,) |(;) /g, '$1')) || 'broadcast';
    
    if (lr.includes('self_only') || lr === 'self') {
      selfOnly = true;
    } else {
      let tokens = lr.split(/[- ,;]/);
      for (let token of tokens) {
        // noinspection FallThroughInSwitchStatementJS
        switch (token) {
          case'self':
            self = true;
            break;
          
          case'child':
            stop = true;
          case'children':
            down = 1;
            break;
          
          
          case'descendent':
          case'descendant':
            stop = true;
          case'descendents':
          case'descendants':
            down = Infinity;
            break;
          
          
          case'parent':
            stop = true;
          case'parents':
            up = 1;
            break;
          case'ancestor':
            stop = true;
          case'ancestors':
            up = Infinity;
            break;
          
          
          case'sibling':
            stop = true;
          case'siblings':
            siblings = true;
            break;
          
          case'kin':
          case'family':
            stop = false;
            up = 1;
            down = 1;
            siblings = true;
            break;
          
          case'broadcast':
            up = Infinity;
            down = Infinity;
            self = true;
            siblings = true;
            break;
          
          
          case'first':
          case'1st':
            stop = true;
            // prevent a issue because of expectations up AND down should not all be null
            if (tokens.length === 1) throw new Error(`[em-async-events] ERROR-1385: token: ${token} cannot be used alone. For event: ${eventName}`);
            break;
          
          case'from':
          case'oldest':
          case'youngest':
            // just here to stop throwing as it is used later
            break;
          
          default:
            throw new Error(`[em-async-events] ERROR-1395: unknown token: ${token} for range: ${lr} for event: ${eventName}`);
        }
      }
    }
    
    // because of the above conditions, both up AND down should never be === null at this point
    // set default values for any null vars
    up = _.isNil(up) ? false : up;
    down = _.isNil(down) ? false : down;
    siblings = _.isNil(siblings) ? false : siblings;
    self = _.isNil(self) ? false : self;
    selfOnly = _.isNil(selfOnly) ? false : selfOnly;
    stop = _.isNil(stop) ? false : stop;
    
    listeners = this.__listenersInRange({
      listeners,
      eventLevel,
      up,
      down,
      selfOnly,
      self,
      siblings,
      eventOrigin,
      eventMeta,
    });
    
    return { stop, listeners };
  }
  
  
  /**
   * pick listeners based on direction and scope
   * @param {array} listeners - array of listeners that we are picking from
   * @param {number} eventIndex - index of event level in listeners array
   * @param {string<"up","down","sides">} dir - the direction to gather listeners towards
   * @param {boolean} isInfinite - is the pick scope infinite or just a single level up or down
   * @param {number} [eventLevel] - the event level
   * @param eventMeta
   * @return {*[]} - array of gathered/picked listeners
   * @private
   */
  __pickListeners ({ listeners, eventIndex, dir, isInfinite, eventLevel, eventMeta }) {
    let tmp, gathered = [];
    if (dir === 'sides') {
      // only cater for listeners on the same level, but not the component (self does that)
      gathered = listeners.filter(l => l.level === eventLevel && l.subscriberID !== eventMeta.emitterID);
    } else {
      if (eventIndex > 0) eventIndex -= 1;
      let firstLevel;
      while (!!(tmp = listeners[eventIndex])) {
        eventIndex = dir === 'up' ? --eventIndex : ++eventIndex;
        
        if (tmp.level === eventLevel) continue; // skip this if on the same level as event (sibling)
        
        if (_.isNil(firstLevel)) firstLevel = tmp.level; // get the 1st listener's level so we get same level listeners if finite
        if (!isInfinite && tmp.level !== firstLevel) break; // stop gathering if we are not on first level if finite
        
        gathered.push(tmp);
        
      }
    }
    
    return gathered;
  }
  
  
  /**
   * get all listeners that are in range of the given bounds
   * @param listeners
   * @param eventLevel
   * @param up
   * @param down
   * @param selfOnly
   * @param self
   * @param siblings
   * @param eventOrigin
   * @param eventMeta
   * @return {*}
   */
  __listenersInRange ({ listeners, eventLevel, up, down, selfOnly, self, siblings, eventOrigin, eventMeta }) {
    // console.debug(`[em-async-events]-603: this.__listenersInRange() - arguments: %o`, arguments[0]);
    
    let upListeners = [], closestListeners = [], downListeners = [];
    
    if (selfOnly) {
      closestListeners = listeners.filter(l => l.subscriberID === eventMeta.emitterID);
    } else {
      // sort listeners by level
      listeners = _.sortBy(listeners, 'level');
      // index of event level in listeners array
      let eventIndex = _.sortedLastIndexBy(listeners, { level: eventLevel }, 'level');
      
      if (up === Infinity) {
        upListeners = upListeners.concat(this.__pickListeners({
          isInfinite: true,
          listeners,
          eventIndex,
          dir:        'up',
          eventLevel,
          eventMeta,
        }));
      } else if (up === 1) {
        upListeners = upListeners.concat(this.__pickListeners({
          isInfinite: false,
          listeners,
          eventIndex,
          dir:        'up',
          eventLevel,
          eventMeta,
        }));
      }
      
      if (siblings) {
        closestListeners = closestListeners.concat(this.__pickListeners({
          isInfinite: false,
          listeners,
          eventIndex,
          dir:        'sides',
          eventLevel,
          eventMeta,
        }));
      }
      
      if (self) {
        closestListeners = closestListeners.concat(listeners.filter(l => l.subscriberID === eventMeta.emitterID));
      }
      
      if (down === 1) {
        downListeners = downListeners.concat(this.__pickListeners({
          isInfinite: false,
          listeners,
          eventIndex,
          dir:        'down',
          eventLevel,
          eventMeta,
        }));
      } else if (down === Infinity) {
        downListeners = downListeners.concat(this.__pickListeners({
          isInfinite: true,
          listeners,
          eventIndex,
          dir:        'down',
          eventLevel,
          eventMeta,
        }));
      }
    }
    
    return _.uniqBy([].concat(upListeners, closestListeners, downListeners), 'id');
  }
  
  
  /**
   * remove all event listeners
   * @param eventName
   * @param subscriberID
   * @param id
   */
  __removeListeners ({ eventName, subscriberID, id }) {
    if (!this.listenersStore[eventName]) return;
    // console.debug(`[index]-1475: __removeListeners() eventName: %o, subscriberID: %o, id: %o`, eventName, subscriberID, id);
    
    for (let li = 0; li < this.listenersStore[eventName].length; li++) {
      if (this.listenersStore[eventName][li].subscriberID === subscriberID && (!id || id === this.listenersStore[eventName][li].id)) {
        if (this.options.debug.all && this.options.debug.removeListener || this.listenersStore[eventName][li].listenerOptions.trace || this.listenersStore[eventName][li].listenerOptions.verbose) {
          const listener = this.listenersStore[eventName][li];
          const { listenerOrigin, listenerOptions } = listener;
          conGrp(`[em-async-events] %c${this.options.fallSilent || '$fallSilent(removeListener)'} %ceventName: %o origin: %o `, 'color: CadetBlue;', 'color: grey;', eventName, _.get(listenerOrigin, '$options.name', '???'));
          if (listenerOptions.verbose) console.warn(`Listener: %o \n\toriginStack: %o`, listener, listener.originStack);
          conGrpEnd();
        }
        
        this.listenersStore[eventName].splice(li, 1);
      }
    }
    
    this.__cleanUpStore(this.listenersStore, eventName);
  }
  
  
  /**
   * cleanup the given store by removing empty lists
   * @param {object} store - the store to cleanup
   * @param {string} [eventID] - the event id to target. If not given then cleansup entire store
   * @private
   */
  __cleanUpStore (store, eventID) {
    const checkDel = (evID) => _.isEmpty(store[evID]) && delete store[evID];
    
    if (_.isEmpty(eventID)) {
      for (const eID in store) checkDel(eID);
    } else {
      checkDel(eventID);
    }
  }
  
  
  /**
   * find given callback in listenersStore
   * @param {function} callback
   * @param {string} eventName
   * @param {string} [subscriberID]
   * @return {function|undefined}
   * @private
   */
  __findCallback (callback, eventName, subscriberID) {
    return this.listenersStore[eventName].find(function (l) {
      return (!l.subscriberID || l.subscriberID === subscriberID) && l.callback === callback;
    });
  }
  
  
  /**
   * find the index of the given callback in listenersStore
   * @param {function} callback
   * @param {string} eventName
   * @param {string} [subscriberID]
   * @return {number}
   * @private
   */
  __findIndexOfCallback (callback, eventName, subscriberID) {
    return this.listenersStore[eventName].findIndex(function (l) {
      return (!l.subscriberID || l.subscriberID === subscriberID) && l.callback === callback;
    });
  }
  
  
  /**
   * remove event callbacks
   * @param {string} eventName
   * @param {string} [subscriberID]
   * @param {function} callback
   */
  __removeCallbacks ({ eventName, callback, subscriberID }) {
    if (!this.listenersStore[eventName]) return;
    
    const indexOfSubscriber = this.__findIndexOfCallback(callback, eventName, subscriberID);
    
    // noinspection JSUnresolvedVariable
    if (~indexOfSubscriber) {
      if (this.options.debug.all && this.options.debug.removeListener || this.listenersStore[eventName][indexOfSubscriber].listenerOptions.trace || this.listenersStore[eventName][indexOfSubscriber].listenerOptions.verbose) {
        const listener = this.listenersStore[eventName][indexOfSubscriber];
        const { listenerOrigin, listenerOptions } = listener;
        conGrp(`[em-async-events] %c${this.options.fallSilent || '$fallSilent(this.__removeCallbacks)'} %ceventName: %o origin: %o `, 'color: CadetBlue;', 'color: grey;', eventName, _.get(listenerOrigin, '$options.name', '???'));
        if (listenerOptions.verbose) console.warn(`Listener: %o \n\toriginStack: %o`, listener, listener.originStack);
        conGrpEnd();
      }
      
      this.listenersStore[eventName].splice(indexOfSubscriber, 1);
    }
    
    this.__cleanUpStore(this.listenersStore, eventName);
  }
  
  
  /**
   * remove event and all its callbacks
   * @param eventName
   */
  __removeAllListeners ({ eventName }) {
    for (let eventN in this.listenersStore) {
      if (eventN === eventName) {
        for (const listener of this.listenersStore[eventN]) {
          if (listener.timeout) listener.timeout.clear();
          
          if (this.options.debug.all && this.options.debug.eraseEvent || listener.listenerOptions.trace || listener.listenerOptions.verbose) {
            conGrp(`[em-async-events] %c${this.options.eraseEvent} %ceventName: %o`, 'color: CadetBlue;', 'color: grey;', eventName);
            console.warn(`Listeners: %o \n\toriginStack: %o`, this.listenersStore[eventName], listener.originStack);
            conGrpEnd();
          }
        }
        
        delete this.listenersStore[eventName];
      }
    }
  }
  
  
  /**
   * assert if prop type is not reserved
   * @param prop
   * @param options
   * @return {boolean|*}
   */
  __isCorrectCustomName (prop, options) {
    if (this.__vueReservedProps.includes(options[prop])) {
      console.warn('[em-async-events]: ' + options[prop] + ' is used by Vue. Use another name');
      return false;
    }
    
    return options && typeof options[prop] === 'string' && options[prop];
  }
  
  
  /**
   * get the component hierarchy level of a given Vue component
   * @param origin {Object}
   * @return {number}
   */
  __getOriginLevel (origin) {
    let level = 0, compo = origin;
    // noinspection JSUnresolvedVariable
    while (compo && compo.$parent) {
      level++;
      compo = compo.$parent;
    }
    return level;
  }
  
  
  /**
   * generate unique id to be used when tracking events and listeners
   * @return {string}
   */
  __genUniqID () {
    return _.uniqueId(Math.random().toString(36).substr(2, 9));
  }
  
  
  __showDeprecationWarning (dep, extra) {
    console.warn(`${dep} was deprecated and no longer supported. ${extra || ''}`);
  }
  
  
  /**
   * @typedef  CallbackPromise {Promise & {resolve: Function, reject: Function, id: string, outcome: undefined, settlement: number, wasInvoked: boolean}}
   */
  /**
   * create a promise to keep track of what is going on
   * @private
   * @return {CallbackPromise}
   */
  __createPromise () {
    let _RESOLVE, _REJECT;
    const promise = new Promise((resolve, reject) => {
      _RESOLVE = resolve; // todo this should run other code before finally resolving
      _REJECT = reject; // todo this should run other code before finally rejecting
    });
    
    // we can use this in user-land to figure out if promise is settled, it's outcome, or manually resolve or reject it...
    return _.merge(promise, {
      id:         this.__genUniqID(),
      resolve:    _RESOLVE,
      reject:     _REJECT,
      settlement: PENDING,
      outcome:    undefined,
      timeout:    undefined,
      wasInvoked: false,
    });
  }
}



module.exports = AsyncEvents;
