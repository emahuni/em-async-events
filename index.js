'use strict';

const _ = require('lodash');
const Bluebird = require('bluebird');

const names = {
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

class AsyncEvents {
  // listeners;
  // lingeringEvents;
  // options;
  // __vueReservedProps
  
  constructor (options = {}) {
    this.listeners = {};
    this.lingeringEvents = {};
    
    this.__vueReservedProps = ['$options', '$parent', '$root', '$children', '$refs', '$vnode', '$slots', '$scopedSlots', '$createElement', '$attrs', '$listeners', '$el'];
    
    this.options = _.defaultsDeep(options, {
      ...names,
      listenersOptions: {
        extra:            undefined,
        stopHere:         false,
        expire:           0,
        expiryCallback:   undefined,
        catchUp:          100,
        once:             false,
        isExclusive:      false,
        replaceExclusive: false,
        trace:            false,
        verbose:          false,
      },
      eventsOptions:    {
        linger:           500,
        bait:             false,
        isExclusive:      false,
        keepExclusive:    false,
        range:            'first-parent',
        trace:            false,
        verbose:          false,
        rejectUnconsumed: false,
      },
      
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
    
    this.options.asyncEvents = this.__isCorrectCustomName('asyncEvents', options) || names.asyncEvents;
    this.options.onEvent = this.__isCorrectCustomName('onEvent', options) || names.onEvent;
    this.options.onceEvent = this.__isCorrectCustomName('onceEvent', options) || names.onceEvent;
    this.options.emitEvent = this.__isCorrectCustomName('emitEvent', options) || names.emitEvent;
    this.options.eraseEvent = this.__isCorrectCustomName('eraseEvent', options) || names.eraseEvent;
    this.options.fallSilent = this.__isCorrectCustomName('fallSilent', options) || names.fallSilent;
    this.options.chainCallbackPayload = this.__isCorrectCustomName('chainCallbackPayload', options) || names.chainCallbackPayload;
    this.options.hasListener = this.__isCorrectCustomName('hasListener', options) || names.hasListener;
    this.options.hasListeners = this.__isCorrectCustomName('hasListeners', options) || names.hasListeners;
    this.options.hasLingeringEvent = this.__isCorrectCustomName('hasLingeringEvent', options) || names.hasLingeringEvent;
    this.options.hasLingeringEvents = this.__isCorrectCustomName('hasLingeringEvents', options) || names.hasLingeringEvents;
  }
  
  /**
   * add event listener
   * @param eventName
   * @param callback
   * @param listenerOptions
   * @param subscriberId
   * @param listenerOrigin
   * @return {Bluebird<*>|array<Bluebird<*>>} - allows waiting for invocation of event with a promise only once (use if you want to continue execution where you adding the listener only when promise is fulfilled)
   */
  onEvent (eventName, callback, listenerOptions, subscriberId = this.__genUniqID(), listenerOrigin) {
    if (!_.isString(eventName) && !_.isArray(eventName)) throw new Error(`[index]-91: onEvent() - eventName should be specified as an string or array of strings representing event name(s)!`);
    
    if (!_.isFunction(callback) && !_.isArray(callback) && _.isNil(listenerOptions)) {
      listenerOptions = callback;
      callback = undefined;
    }
    
    listenerOptions = _.merge({}, this.options.listenersOptions, listenerOptions);
    if (listenerOptions.isAsync) this.__showDeprecationWarning('isAsync', 'All events and listeners are now async.');
    
    // if this event doesn't have  a callback, then just create one that returns the given payload
    if (!_.isFunction(callback) && !_.isArray(callback)) callback = (payload) => payload;
    
    const args = {
      eventName,
      callback,
      listenerOptions,
      subscriberId,
      listenerOrigin,
    };
    
    
    if (_.isArray(eventName) || _.isArray(callback)) {
      if (!_.isArray(eventName)) eventName = [eventName];
      if (!_.isArray(callback)) callback = [callback];
      
      const vows = [];
      for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
        for (let callbackIndex = 0, _len = callback.length; callbackIndex < _len; callbackIndex++) {
          vows.push(this.__addListener({
            ...args,
            eventName: eventName[eventNameIndex],
            callback:  callback[callbackIndex],
          }));
        }
      }
      
      return vows;
    } else {
      return this.__addListener(args);
    }
  }
  
  /**
   * add event listener that only listens for event once and removed once executed
   * @param eventName
   * @param callback
   * @param listenerOptions
   * @param subscriberId
   * @param listenerOrigin
   * @return {Bluebird<*>|array<Bluebird<*>>} - allows waiting for invocation of event with a promise only once (use if you want to continue execution where you adding the listener only when promise is fulfilled)
   * */
  onceEvent (eventName, callback, listenerOptions, subscriberId = this.__genUniqID(), listenerOrigin) {
    listenerOptions = _.merge({}, this.options.listenersOptions, listenerOptions);
    listenerOptions.once = true;
    
    return this.onEvent(eventName, callback, listenerOptions, subscriberId, listenerOrigin);
  }
  
  
  /**
   * emit event and run callbacks subscribed to the event
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @return {Bluebird<*>|array<Bluebird>}
   */
  emitEvent (eventName, payload, eventOptions, eventOrigin) {
    if (!_.isString(eventName) && !_.isArray(eventName)) throw new Error(`[index]-160: emitEvent() - eventName should be specified as an string or array of strings representing event name(s)!`);
    
    eventOptions = _.merge({}, this.options.eventsOptions, eventOptions);
    
    if (eventOptions.isAsync) this.__showDeprecationWarning('isAsync', 'All events and listeners are now async.');
    
    if (eventOptions.bait /*&& !eventOptions.linger*/) {
      eventOptions.linger = Infinity;
      // eventOptions.isExclusive = true;
    }
    
    const eventMeta = {};
    
    const args = {
      eventName,
      payload,
      eventOptions,
      eventOrigin,
      eventMeta,
    };
    
    let vows = [];
    
    /*if (eventOptions.volatile) {
      return this.__runEvent(args);
    } else {*/
    if (_.isArray(eventName)) {
      for (let ei = 0, _len2 = eventName.length; ei < _len2; ei++) {
        vows.push(this.__runEvent_linger({
          ...args,
          eventName: eventName[ei],
          payload,
        }));
      }
      
      return vows;
    }
    
    return this.__runEvent_linger(args);
    // }
  }
  
  
  /**
   * chain listeners results
   * @param payload
   * @param newPayload
   * @return {Bluebird<*>}
   */
  chainCallbackPayload (payload, newPayload) {
    if (this.options.debug.all && this.options.debug.chainListenerCallbacks) {
      console.info(`[em-async-events]-169: ${this.options.chainCallbackPayload} payload: %o \nnewPayload: %o`, payload, newPayload);
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
    if (!_.isEmpty(this.listeners)) {
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
   * @param eventName {string|Array<string>|undefined} - event name of events/listeners to unsubscribe
   * @param callback {Function|Array<Function>|undefined} the callback/Array of callbacks that should be unsubscribed
   * @param subscriberId
   */
  fallSilent (eventName, callback, subscriberId) {
    // console.debug(`[em-async-events]-205: fallSilentProp () compo: %o, eventName: %o, callback: %o`, this, eventName, callback);
    
    if (!_.isEmpty(this.listeners)) {
      // Unsubscribe component from specific event
      if (!callback && typeof eventName === 'string' && eventName in this.listeners) {
        // console.debug(`[em-async-events]-210: fallSilentProp() - Unsubscribe component from specific event: %o`, this);
        this.__removeListeners({ eventName, subscriberId });
        
        return;
      }
      
      // Unsubscribe component from specific events
      if (!callback && _.isArray(eventName)) {
        // console.debug(`[em-async-events]-218: fallSilentProp() - Unsubscribe component from specific events: %o`, this);
        
        for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
          this.__removeListeners({ eventName: eventName[eventIndex], subscriberId });
        }
        
        return;
      }
      
      // Remove array of callbacks for specific event
      if (_.isArray(callback) && this.hasListener(eventName)) {
        // console.debug(`[em-async-events]-229: fallSilentProp() - Remove array of callbacks for specific event: %o`, this);
        
        for (let callbackIndex = 0, _len4 = callback.length; callbackIndex < _len4; callbackIndex++) {
          this.__removeCallbacks({ eventName, subscriberId, callback: callback[callbackIndex] });
        }
        
        return;
      }
      
      // Remove specific callback for specific event
      if (callback && this.hasListener(eventName)) {
        // console.debug(`[em-async-events]-240: fallSilentProp() - Remove specific callback for specific event: %o`, this);
        
        this.__removeCallbacks({ eventName, subscriberId, callback });
        
        return;
      }
      
      // remove all events in component, since no eventName or callback specified; done automatically
      if (!eventName && !callback) {
        // console.debug(`[em-async-events]-249: fallSilentProp() - remove all events in component, since no eventName or callback specified; done automatically: %o`, this);
        for (let eventName in this.listeners) {
          this.__removeListeners({ eventName, subscriberId });
        }
      }
    }
  }
  
  /**
   * check to see if we have any listener for the given eventID
   * @param {string} eventID - event id to check
   * @param {object} listeners - events listeners that we should check from
   * @return {boolean}
   */
  hasListener (eventID, listeners = this.listeners) {
    return this.hasListeners(eventID, listeners);
  }
  
  /**
   * check to see if we have any listener for any of the given eventID(s)
   * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
   * @param {object} listeners - events listeners that we should check from
   * @return {boolean}
   */
  hasListeners (eventIDs, listeners = this.listeners) {
    if (!eventIDs) return false;
    if (!_.isArray(eventIDs)) eventIDs = [eventIDs];
    return eventIDs.some(eid => !_.isEmpty(_.get(listeners, eid)));
  }
  
  /**
   * check to see if we have any lingeringEvent for the given eventID
   * @param {string} eventID - event id to check
   * @param {object} levents - lingering events that we should check from
   * @return {boolean}
   */
  hasLingeringEvent (eventID, levents = this.lingeringEvents) {
    return this.hasLingeringEvents(eventID, levents);
  }
  
  /**
   * check to see if we have any lingering events for any of the given eventID(s)
   * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
   * @param {object} levents - lingering events that we should check from
   * @return {boolean}
   */
  hasLingeringEvents (eventIDs, levents = this.lingeringEvents) {
    if (!eventIDs) return false;
    if (!_.isArray(eventIDs)) eventIDs = [eventIDs];
    return eventIDs.some(eid => !_.isEmpty(_.get(levents, eid)));
  }
  
  
  
  /**
   * install plugin
   * @param Vue
   * @param options
   */
  install (Vue, options) {
    this.options = _.defaultsDeep(options, this.options);
    
    // turn off debugging if we are not going to show devtools/in production
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
    
    /**
     * mix into vue
     */
    Vue.mixin({
      data () {
        return {
          shouldFallSilent: true,
        };
      },
      beforeCreate: function vueHookedAsyncEventsBeforeCreate () {
        this._uniqID = AE_this.__genUniqID();
      },
      
      beforeDestroy: function vueHookedAsyncEventsBeforeDestroy () {
        if (this.shouldFallSilent) this[fallSilentProp]();
      },
    });
    
    /**
     * plugin local state
     */
    Vue.prototype[asyncEventsProp] = {
      listeners:          this.listeners,
      lingeringEvents: this.lingeringEvents,
      options:         this.options,
      
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
      return AE_this.onEvent(eventName, callback, listenerOptions, this._uniqID, this);
    };
    
    
    /**
     * add event listener that only listens for event once and removed once executed
     * @param eventName
     * @param callback
     * @param listenerOptions
     */
    Vue.prototype[onceEventProp] = function (eventName, callback, listenerOptions) {
      return AE_this.onceEvent(eventName, callback, listenerOptions, this._uniqID, this);
    };
    
    /**
     * emit event and run callbacks subscribed to the event
     * @param eventName
     * @param payload
     * @param eventOptions
     * @return {Bluebird<*>|array<Bluebird>}
     */
    Vue.prototype[emitEventProp] = function (eventName, payload, eventOptions) {
      return AE_this.emitEvent(eventName, payload, eventOptions, this);
    };
    
    
    /**
     * chain listeners results
     * @param payload
     * @param newPayload
     * @return {Bluebird<*>}
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
      return AE_this.fallSilent(eventName, callback, this._uniqID);
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
      listeners = _.filter(listeners, (listener) => _.get(listener, `${origin}._uid`) === vm._uid);
      return !!listeners.length;
    }
    
    /**
     * check to see if component has any listener for the given eventID
     * @param {string} eventID - event id to check
     * @return {boolean}
     */
    Vue.prototype[hasListenerProp] = function (eventID) {
      return checkComponentEvents(eventID, AE_this.listeners, 'listenerOrigin', this);
    };
    /**
     * check to see if the component has any listeners for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @return {boolean}
     */
    Vue.prototype[hasListenersProp] = function (eventIDs) {
      return checkComponentEvents(eventIDs, AE_this.listeners, 'listenerOrigin', this);
    };
    
    
    /**
     * check to see if we have any lingeringEvent for the given eventID
     * @param {string} eventID - event id to check
     * @return {boolean}
     */
    Vue.prototype[hasLingeringEventProp] = function (eventID) {
      return checkComponentEvents(eventID, AE_this.lingeringEvents, 'eventMeta.eventOrigin', this);
    };
    /**
     * check to see if we have any lingering event for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @return {boolean}
     */
    Vue.prototype[hasLingeringEventsProp] = function (eventIDs) {
      return checkComponentEvents(eventIDs, AE_this.lingeringEvents, 'eventMeta.eventOrigin', this);
    };
  }
  
  
  
  // Privates
  
  /**
   * Add event listener
   * @param eventName
   * @param callback
   * @param listenerOptions
   * @param subscriberId
   * @param listenerOrigin
   */
  __addListener ({ eventName, callback, listenerOptions, subscriberId, listenerOrigin }) {
    // get existing exclusive listener
    const exclusiveListener = (this.listeners[eventName] || []).find(l => l.listenerOptions.isExclusive && l.subscriberId === subscriberId);
    
    // bailout if there is an exclusive listener of the same event name on the component
    if (exclusiveListener && !exclusiveListener.replaceExclusive) {
      if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
        console.info(`[em-async-events]-376: ABORTING (exclusive listener exists) ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o Listener Origin: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'));
      }
      // todo we should throw here
      return;
    }
    
    // todo we can add level to add listener options for non-vue usage
    const level = listenerOrigin ? this.__getOriginLevel(listenerOrigin) : 0;
    const id = this.__genUniqID();
    // create a promise that can be waited for by listener
    let lResolve, lReject;
    // create listener object
    const listener = {
      eventName,
      callback,
      listenerOptions,
      subscriberId,
      listenerOrigin,
      listenerPromise: {
        promise:    new Bluebird((resolve, reject) => {
          lResolve = resolve;
          lReject = reject;
        }),
        resolve:    lResolve,
        reject:     lReject,
        settlement: 0, // 0: it's pending, 1: it's resolved, and -1: it's rejected
        outcome:    undefined,
      },
      id,
      level,
    };
    
    if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
      console.info(`[em-async-events]-394: ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o Listener Origin: %o \nListener: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'), listener);
    }
    
    // results that happen here will be sent thru the listener promise chain.
    this.__invokeLingeredEventsAtAddListener({ ...arguments[0], listener });
    
    // only add to listeners if the it's not once or isn't settled yet.
    if (!listenerOptions.once || listener.listenerPromise.settlement === 0) {
      if (!exclusiveListener) {
        (this.listeners[eventName] || (this.listeners[eventName] = [])).push(listener);
      } else {
        const index = this.listeners[eventName].findIndex(l => l.id === exclusiveListener.id);
        // replace the exclusive listener
        this.listeners[eventName][index] = listener;
      }
      
      if (listenerOptions.expire) {
        setTimeout(() => {
          if (!!listenerOptions.expiryCallback) listenerOptions.expiryCallback(listener);
          // noinspection JSCheckFunctionSignatures
          this.__removeListeners({ ...listener });
        }, listenerOptions.expire);
      }
    }
    
    // todo return the actual promise, don't create another one?
    switch (listener.listenerPromise.settlement) {
      case 1:
        return Bluebird.resolve(listener.listenerPromise.outcome);
      case -1:
        return Bluebird.reject(listener.listenerPromise.outcome);
      default:
        return listener.listenerPromise.promise;
    }
  }
  
  /**
   * Run event callbacks
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @param eventMeta
   * @return {Bluebird|Promise}
   */
  __runEvent_linger ({ eventName, payload, eventOptions, eventOrigin, eventMeta }) {
    /** run event */
    let listeners = this.listeners[eventName];
    let listenersTally = listeners && listeners.length;
    const level = this.__getOriginLevel(eventOrigin);
    
    _.merge(eventMeta, {
      listeners:         this.listeners,
      eventName,
      payloads:       [payload],
      eventTimestamp: Date.now(),
      eventOptions:   _.cloneDeep(eventOptions),
      eventOrigin,
      stopNow:        false,
      wasConsumed:    false,
      level,
      listenersTally,
    });
    
    if (this.options.debug.all && this.options.debug.emitEvent || eventOptions.trace) {
      console.info(`[em-async-events]-152: ${this.options.emitEvent} eventName: %o payload: %o\n origin: %o eventMeta: %o`, eventName, payload, _.get(eventOrigin, '$options.name', '???'), eventMeta);
    }
    
    payload = this.__runListeners({
      listeners, eventName, payload, eventOptions, eventOrigin, eventMeta,
    });
    
    
    
    /** linger */
    if (!eventMeta.stopNow) {
      return this.__lingerEvent({ eventName, payload, eventOptions, eventMeta });
    } else {
      console.debug(`[index]-659: __runEvent_linger() - eventMeta: %o`, eventMeta);
      if (!eventMeta.wasConsumed) {
        if (this.options.debug.all) {
          console.warn(`[em-async-events]-660: - eventName: %o wasn't consumed! Check the event name correctness, or adjust its "linger" time or the listeners' "catchUp" time to bust event race conditions.`, eventName);
        }
        
        // todo use single promise point
        if (eventOptions.rejectUnconsumed) return Bluebird.reject(`Event "${eventName}" NOT consumed!`);
        else return Bluebird.resolve();
      } else {
        return Bluebird.resolve(payload);
      }
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
   * @return {Bluebird<*>}
   * @private
   */
  __runListeners ({
                             listeners,
                             eventName,
                             payload,
                             eventOptions,
                             eventOrigin,
                             eventMeta,
                           }) {
    let finalOutcome = payload;
    let listenersTally = listeners && listeners.length;
    
    // console.debug(`[em-async-events] index-564: - eventName: %o, \neventOrigin: %o, \n_listeners: %o\neventMeta: %o`, eventName, eventOrigin, listeners, eventMeta);
    
    if (listenersTally) {
      let upListeners, closestListeners, downListeners, stop;
      
      if (!!eventOrigin) {
        ({ upListeners, closestListeners, downListeners, stop } = this.__getBroadcastListenerRange({
          ...arguments[0],
          eventLevel: eventMeta.level,
        }));
      } else {
        closestListeners = listeners;
      }
      
      let i = 0, stopHere = false;
      let upListener, closestListener, downListener;
      do {
        upListener = upListeners && upListeners[i];
        closestListener = closestListeners && closestListeners[i];
        downListener = downListeners && downListeners[i];
        
        // console.debug(`[em-async-events]-423: this.__runListeners() - upListener: %o, downListener: %o`, upListener, downListener);
        
        const upClosestDownListeners = [closestListener, upListener, downListener].filter(l => !_.isNil(l));
        // console.debug(`[em-async-events]-426: this.__runListeners() - upClosestDownListeners: %o`, upClosestDownListeners);
        
        // run both up and down listeners (which ever is available)
        for (let listener of upClosestDownListeners) {
          if (stop || listener.listenerOptions.stopHere) stopHere = true;
          
          if (this.options.debug.all && this.options.debug.invokeListener || eventOptions.trace || listener.listenerOptions.trace) {
            let trace = console.info;
            if (eventOptions.verbose || listener.listenerOptions.verbose) trace = console.trace;
            trace(`[em-async-events]-380: Invoke Listener - eventName: %o, payload: %o, \n origin: %o, eventOrigin: %o, Listener: %o\neventMeta: %o\nresponse: %o, \nstoppingHere: %o`, eventName, payload, _.get(listener.listenerOrigin, '$options.name', '???'), _.get(eventOrigin, '$options.name', '???'), listener, eventMeta, finalOutcome, stopHere);
          }
          
          try {
            if (_.isFunction(listener.callback)) {
              finalOutcome = listener.callback(payload, {
                eventMeta,
                listenerOptions: listener.listenerOptions,
                extra:           listener.listenerOptions.extra,
              });
            }
            
            // only capture the first outcome becoz that's what promises do, once resolved or rejected it's settled.
            if (listener.listenerPromise.settlement === 0) {
              listener.listenerPromise.outcome = finalOutcome;
              listener.listenerPromise.settlement = 1; // resolved
              listener.listenerPromise.resolve(finalOutcome);
              eventMeta.payloads.push(finalOutcome);
              eventMeta.wasConsumed = true;
            }
          } catch (e) {
            if (listener.listenerPromise.settlement === 0) {
              listener.listenerPromise.settlement = -1; // rejected
              // rejects with previous finalOutcome.
              listener.listenerPromise.reject(finalOutcome);
            }
          }
          
          
          if (listener.listenerOptions.once) {
            this.__removeCallbacks({
              eventName,
              subscriberId: listener.subscriberId,
              callback:     listener.callback,
            });
          }
          
          
          if (stopHere) {
            eventMeta.stopNow = true;
            break;
          }
        }
        
        if (stopHere) {
          eventMeta.stopNow = true;
          break;
        }
        
        i++;
        // todo cater for linger and expire changes from listener
      } while (upListener || downListener || closestListener);
    }
    
    return finalOutcome;
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
      // get existing exclusive lingered event
      const exclusiveLingeredEvent = (this.lingeringEvents[eventName] || []).find(e => e.eventMeta.eventOptions.isExclusive);
      
      // bailout if exclusive lingered event is set to be kept (meaning don't replace with fresh event)
      if (exclusiveLingeredEvent && exclusiveLingeredEvent.keepExclusive) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          let trace = console.info;
          if (eventOptions.verbose) trace = console.trace;
          trace(`[em-async-events]-587: ABORTING lingerEvent - for exclusive lingered eventName: %o \n%o`, eventName, eventMeta);
        }
        
        return Bluebird.resolve(payload);
      }
      
      // bailout if baited but consumed event
      if (eventMeta.wasConsumed && eventOptions.bait) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          let trace = console.info;
          if (eventOptions.verbose) trace = console.trace;
          trace(`[em-async-events]-827: ABORTING lingerEvent - baited but consumed eventName: %o eventMeta: %o`, eventName, eventMeta);
        }
        
        return Bluebird.resolve(payload);
      }
      
      if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
        console.info(`[em-async-events]-597: lingerEvent - eventName: %o eventMeta: %o`, eventName, eventMeta);
      }
      
      const id = this.__genUniqID();
      
      let lResolve, lReject;
      const event = {
        id,
        // to be resolved by run callbacks, see this.__invokeLingeredEventsAtAddListener
        lingeringEventPromise: {
          promise: new Bluebird((resolve, reject) => {
            lResolve = resolve;
            lReject = reject;
          }),
          settled: false,
          resolve: lResolve,
          reject:  lReject,
        },
        payload,
        eventMeta,
      };
      
      // stash event for later use on new listeners of same eventName
      if (!exclusiveLingeredEvent) {
        (this.lingeringEvents[eventName] || (this.lingeringEvents[eventName] = [])).push(event);
      } else {
        const index = this.lingeringEvents[eventName].findIndex(e => e.id === exclusiveLingeredEvent.id);
        this.lingeringEvents[eventName][index] = event;
        // todo if we update state using bait, this can create an event based state updated by emissions and read by once listeners
        //  (may actually create an easy API around this... problem is the API is based on this module ;D)
        //  you need to somehow make sure payload isn't overwritten, it should merge it.
      }
      
      this.__decayLingeredEvent(eventName, event, eventOptions);
      
      return event.lingeringEventPromise.promise;
    }
  }
  
  
  __decayLingeredEvent (eventName, event, eventOptions) {
    // order the splice after linger ms later
    let timeout = eventOptions.linger;
    if (timeout >= Infinity) timeout = 2147483647; // set to maximum allowed so that we don't have an immediate bailout
    
    setTimeout((e) => {
      // finally resolve/reject lingering event promise
      if (e.eventMeta.wasConsumed) {
        e.lingeringEventPromise.resolve(e.payload);
      } else {
        if (eventOptions.rejectUnconsumed) e.lingeringEventPromise.reject(`Lingered Event "${eventName}" NOT consumed!`);
        else e.lingeringEventPromise.resolve();
      }
      
      console.debug(`[index]-893: () - eventMeta: %o`, e.eventMeta);
      
      const i = this.lingeringEvents[eventName].findIndex(le => le.id === e.id);
      this.__removeLingeringEventAtIndex(eventName, i, eventOptions, e.eventMeta);
    }, timeout, event);
  }
  
  
  /**
   * run lingered events for listener (triggered during add listener)
   * @param eventName
   * @param listener
   */
  __invokeLingeredEventsAtAddListener ({ eventName, listener }) {
    // check if listener has an events lingering for it, if so then trigger these events on listener to handle
    if (!!listener.listenerOptions.catchUp && this.hasLingeringEvents(eventName)) {
      for (let ei in this.lingeringEvents[eventName]) {
        // noinspection JSUnfilteredForInLoop
        const lingeringEvent = this.lingeringEvents[eventName][ei];
        const { payload, eventMeta } = lingeringEvent;
        
        // is listener catchUp within range?
        if (Math.abs(listener.listenerOptions.catchUp) <= (Date.now() - eventMeta.eventTimestamp)) {
          const { eventOptions, eventOrigin } = eventMeta;
          
          // the reason here is that we need it to pass thru the levels logic too
          listener.listenerPromise.outcome = this.__runListeners({
            payload,
            listeners: [listener],
            eventName,
            eventOptions,
            eventOrigin,
            eventMeta,
          });
          
          // todo bait logic should be done only when all listeners have taken the bait, since we can add multiple listeners per onEvent/onceEvent
          if (eventOptions.bait && eventMeta.wasConsumed) {
            // noinspection JSUnfilteredForInLoop
            this.__removeLingeringEventAtIndex(eventName, ei, eventOptions, eventMeta);
          }
        }
      }
    }
  }
  
  __removeLingeringEventAtIndex (eventName, index, eventOptions, eventMeta) {
    if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
      console.info(`[em-async-events]-911: remove lingerEvent - eventName: %o on index: %o`, eventName, index);
    }
    
    if (this.options.debug.all && !eventMeta.wasConsumed) {
      console.warn(`[em-async-events]-924: - Lingered eventName: %o wasn't consumed! Check the event name correctness, or adjust its "linger" time or the listeners' "catchUp" time to bust event race conditions.`, eventName);
    }
    
    this.lingeringEvents[eventName].splice(index, 1);
    if (_.isEmpty(this.lingeringEvents[eventName])) delete this.lingeringEvents[eventName];
  }
  
  
  /**
   * get event broadcast components level range
   * @param eventName
   * @param eventOptions
   * @param eventOrigin
   * @param listeners
   * @param eventLevel
   */
  __getBroadcastListenerRange ({ eventName, eventOptions, eventOrigin, listeners, eventLevel }) {
    let
        /**
         * use listeners going up
         * @type {number}
         */
        up = null,
        /**
         * use listeners going down
         * @type {number}
         */
        down = null,
        /**
         * stop at the first listener
         * @type {boolean}
         */
        stop = null,
        selfOnly = false;
    
    const lr = eventOptions.range;
    
    if (lr) {
      if (lr.includes('self')) {
        up = 0;
        down = 0;
        selfOnly = true;
      } else {
        let tokens = lr.split('-');
        for (let token of tokens) {
          switch (token) {
            case'child':
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
            case'ancestors':
              up = Infinity;
              break;
            
            
            case'sibling':
              stop = true;
            case'siblings':
              up = 0;
              down = 0;
              break;
            case'kin':
            case'family':
              stop = true;
            case'kins':
            case'families':
              up = 1;
              down = 1;
              break;
            case'broadcast':
              up = Infinity;
              down = Infinity;
              break;
            
            
            case'first':
            case'1st':
              stop = true;
              // prevent a issue because of expectations up AND down should not all be null
              if (tokens.length === 1) up = 1;
              break;
            
            default:
              throw new Error(`[em-async-events] ERROR-562: unknown token: ${token} for range: ${lr} for event: ${eventName}`);
          }
        }
      }
    } else {
      // just invoke the first parent or sibling
      up = 1;
      down = -1;
      stop = true;
    }
    
    // because of the above conditions, both up AND down should never be === null at this point
    // set default values for any null vars
    up = _.isNil(up) ? -1 : up;
    down = _.isNil(down) ? -1 : down;
    stop = _.isNil(stop) ? false : stop;
    
    let ranged = this.__listenersInRange({ listeners, eventLevel, up, down, selfOnly, eventOrigin });
    
    return { stop, selfOnly, ...ranged };
  }
  
  
  /**
   * get all listeners that are in range of the given bounds
   * @param listeners
   * @param level
   * @param up
   * @param down
   * @param selfOnly
   * @return {*}
   */
  __listenersInRange ({ listeners, eventLevel, up, down, selfOnly, eventOrigin }) {
    // console.debug(`[em-async-events]-603: this.__listenersInRange() - arguments: %o`, arguments[0]);
    
    let closest, upListeners = [], closestListeners = [], downListeners = [];
    
    if (selfOnly) {
      closestListeners = [listeners.find(l => l.listenerOrigin._uid === eventOrigin._uid)].filter(l => !_.isNil(l));
    } else {
      let i = 0;
      let minDiff = 1000;
      
      // sort listeners by level
      listeners.sort((a, b) => a.level - b.level);
      for (i in listeners) {
        /**
         * get the diff btw event level and current listener level
         * @type {number}
         */
        const levelDiff = Math.abs(eventLevel - listeners[i].level);
        
        /**
         * pick up, closest and down listeners (mutates i)
         */
        const pickCls = () => {
          let tmp, ii;
          
          minDiff = levelDiff;
          closest = listeners[i];
          
          /** up **/
          if (up > 0) {
            ii = i;
            tmp = listeners[--ii];
            if (!!tmp) {
              upListeners = [tmp];
              // get all listeners on the same level as current upListeners level or if infinity, to the top
              while ((tmp = listeners[--ii]) &&
              (up === Infinity || up === 1 && tmp.level === upListeners[0].level)) {
                upListeners.push(tmp);
              }
            } else {
              upListeners = [];
            }
          }
          
          /** closest **/
          // keep the closest listeners on the same level
          closestListeners = [closest];
          // find all listeners that're on the same level as closest and keep em
          while ((tmp = listeners[++i]) && tmp.level === closest.level) closestListeners.push(tmp);
          
          /** down **/
          if (!!tmp && down > 0) {
            ii = i;
            downListeners = [tmp];
            // get all listeners on the same level as current downListeners level or if infinity, to the bottom
            while ((tmp = listeners[++ii]) &&
            (down === Infinity || down === 1 && tmp.level === downListeners[0].level)) {
              downListeners.push(tmp);
            }
          } else {
            downListeners = [];
          }
        };
        
        // check if current listener level is closer to level
        if (levelDiff < minDiff) {
          /** only pick the closest if it's within range limits **/
          // pick if we expect if to be above and is above level
          if (up > 0 && listeners[i].level <= eventLevel) pickCls();
          // pick if we expect if to be below and is below level
          else if (down > 0 && listeners[i].level >= eventLevel) pickCls();
          // pick if we expect if to be on the same level and is on the same level
          else if ((up === 0 || down === 0) && listeners[i].level === eventLevel) pickCls();
          // pick if expect infinity and ...
          else if (up === Infinity && listeners[i].level <= eventLevel) pickCls();
          else if (down === Infinity && listeners[i].level >= eventLevel) pickCls();
        }
      }
    }
    
    return { upListeners, closestListeners, downListeners };
  }
  
  
  /**
   * remove all event listeners
   * @param eventName
   * @param subscriberId
   * @param id
   */
  __removeListeners ({ eventName, subscriberId, id }) {
    if (!this.listeners[eventName]) return;
    
    for (let li = 0; li < this.listeners[eventName].length; li++) {
      if (this.listeners[eventName][li].subscriberId === subscriberId && (!id || id === this.listeners[eventName][li].id)) {
        if (this.options.debug.all && this.options.debug.removeListener || this.listeners[eventName][li].listenerOptions.trace) {
          const listener = this.listeners[eventName][li];
          const { listenerOrigin } = listener;
          console.info(`[em-async-events]-694: ${this.options.fallSilent || '$fallSilent(removeListener)'} eventName: %o origin: %o \nListener: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'), listener);
        }
        
        this.listeners[eventName].splice(li, 1);
      }
    }
  }
  
  
  /**
   * remove event callbacks
   * @param eventName
   * @param subscriberId
   * @param callback
   */
  __removeCallbacks ({  eventName, subscriberId, callback }) {
    if (!this.listeners[eventName]) return;
    
    let indexOfSubscriber = this.listeners[eventName].findIndex(function (el) {
      return el.subscriberId === subscriberId && el.callback === callback;
    });
    
    if (~indexOfSubscriber) {
      if (this.options.debug.all && this.options.debug.removeListener || this.listeners[eventName][indexOfSubscriber].listenerOptions.trace) {
        const listener = this.listeners[eventName][indexOfSubscriber];
        const { listenerOrigin } = listener;
        console.info(`[em-async-events]-721: ${this.options.fallSilent || '$fallSilent(this.__removeCallbacks)'} eventName: %o origin: %o \nListener: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'), listener);
      }
      
      this.listeners[eventName].splice(indexOfSubscriber, 1);
    }
    
    if (_.isEmpty(this.listeners[eventName])) delete this.listeners[eventName];
  }
  
  
  /**
   * remove event and all its callbacks
   * @param eventName
   */
  __removeAllListeners ({ eventName }) {
    for (let event in this.listeners) {
      if (event === eventName) {
        if (this.options.debug.all && this.options.debug.eraseEvent) {
          console.info(`[em-async-events]-737: ${this.options.eraseEvent} eventName: %o \nListener: %o`, eventName, this.listeners[eventName]);
        }
        delete this.listeners[eventName];
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
   * get the component hierachy level of a given Vue component
   * @param origin
   * @return {number}
   */
  __getOriginLevel (origin) {
    let level = 0, compo = origin;
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
    return   _.uniqueId(Math.random().toString(36).substr(2, 9));
  }
  
  __showDeprecationWarning (dep, extra) {
    console.warn(`${dep} was deprecated and no longer supported. ${extra || ''}`);
  }
}



module.exports = AsyncEvents;



