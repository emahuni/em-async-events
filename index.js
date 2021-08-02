'use strict';

import _ from 'lodash';

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
  // events;
  // lingeringEvents;
  // options;
  // __vueReservedProps
  
  constructor (options = {}) {
    this.events = {};
    this.lingeringEvents = {};
    
    this.__vueReservedProps = ['$options', '$parent', '$root', '$children', '$refs', '$vnode', '$slots', '$scopedSlots', '$createElement', '$attrs', '$listeners', '$el'];
    
    this.options = _.defaultsDeep(options, {
      ...names,
      listenersOptions: {
        extra:            undefined,
        stopHere:         false,
        expire:           0,
        expiryCallback:   undefined,
        catchUp:          0,
        once:             false,
        isAsync:          true,
        isExclusive:      false,
        replaceExclusive: false,
        trace:            false,
        verbose:          false,
      },
      eventsOptions:    {
        linger:        0,
        isExclusive:   false,
        keepExclusive: false,
        forNextOnly:   false,
        isAsync:       true,
        range:         'first-parent',
        trace:         false,
        verbose:       false,
      },
      globalLinger:     500,
      debug:            {
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
   */
  onEvent (eventName, callback, listenerOptions, subscriberId = _.uniqueId(), listenerOrigin) {
    listenerOptions = _.defaultsDeep(listenerOptions, this.options.listenerOptions);
    
    /*if (listenerOptions.isAsync && !listenerOptions.once) {
      throw new Error(`[vue-hooked-async-events]-99: Cannot use isAsync with non-once event listeners. Consider using a callback that re-listens for the same same event instead.`);
    }*/
    
    const args = {
      eventName,
      callback,
      listenerOptions,
      subscriberId,
      listenerOrigin,
    };
    
    if (_.isArray(eventName) && _.isArray(callback)) {
      for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
        for (let callbackIndex = 0, _len = callback.length; callbackIndex < _len; callbackIndex++) {
          this.__addListener({
            ...args,
            eventName: eventName[eventNameIndex],
            callback:  callback[callbackIndex],
          });
        }
      }
      
      return;
    }
    
    if (_.isArray(eventName)) {
      for (let _eventNameIndex = 0, _len2 = eventName.length; _eventNameIndex < _len2; _eventNameIndex++) {
        this.__addListener({
          ...args,
          eventName: eventName[_eventNameIndex],
        });
      }
      
      return;
    }
    
    if (_.isArray(callback)) {
      for (let _callbackIndex = 0, _len3 = callback.length; _callbackIndex < _len3; _callbackIndex++) {
        this.__addListener({
          ...args,
          callback: callback[_callbackIndex],
        });
      }
    } else {
      this.__addListener({
        ...args,
      });
    }
  }
  
  /**
   * add event listener that only listens for event once and removed once executed
   * @param eventName
   * @param callback
   * @param listenerOptions
   * @param subscriberId
   * @param listenerOrigin
   */
  onceEvent (eventName, callback, listenerOptions, subscriberId = _.uniqueId(), listenerOrigin) {
    if (typeof callback !== 'function' && !listenerOptions) {
      listenerOptions = callback;
      callback = undefined;
    }
    
    listenerOptions = _.defaultsDeep(listenerOptions, this.options.listenerOptions);
    listenerOptions.once = true;
    
    /**
     * creates a listener
     * @param cb
     */
    const createListener = (cb) => {
      this.onEvent(eventName, cb, listenerOptions, subscriberId, listenerOrigin);
    };
    
    // this can be used to wait for listener to trigger before proceeding with code below where listener was created
    if (listenerOptions.isAsync) {
      if (_.isArray(callback)) {
        throw new Error(`[vue-hooked-async-events]-179: You cannot use isAsync listener with atomic API (multiple callbacks)`);
      }
      
      /**
       * override the callback with one that will return to the listener origin
       * - it's async just in case the original is also async (one that returns results to event emitter)
       */
      return new Promise(resolve => createListener(async (...args) => {
        return resolve(!!callback ? await callback(...args) : args[0]);
      }));
    } else {
      // just create a listener normally
      createListener(callback);
    }
  }
  
  
  /**
   * emit event and run callbacks subscribed to the event
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @return {Promise<*>|array<Promise>}
   */
  emitEvent (eventName, payload, eventOptions, eventOrigin) {
    eventOptions = _.defaultsDeep(eventOptions, this.options.eventOptions);
    
    if (eventOptions.forNextOnly && !eventOptions.linger) {
      eventOptions.linger = Infinity;
      eventOptions.isExclusive = true;
    }
    
    const args = {
      eventName,
      payload,
      eventOptions,
      eventOrigin,
    };
    
    let promises = [];
    /*
     // this wont work if payload is actually a response in array form
     if (isArray(eventName) && isArray(payload)) {
     for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
     for (let payloadIndex = 0, _len = payload.length; payloadIndex < _len; payloadIndex++) {
     promises.push(this.__runEventCallbacks({
     ...args,
     eventName: eventName[eventNameIndex],
     payload:  payload[payloadIndex]
     }));
     }
     }

     return promises;
     }
     */
    
    if (_.isArray(eventName)) {
      for (let _eventNameIndex = 0, _len2 = eventName.length; _eventNameIndex < _len2; _eventNameIndex++) {
        promises.push(this.__runEventCallbacks({
          ...args,
          eventName: eventName[_eventNameIndex],
          payload,
        }));
      }
      
      return promises;
    }
    
    return this.__runEventCallbacks({
      ...args,
    });
  }
  
  
  /**
   * chain listeners results
   * @param payload
   * @param newPayload
   * @return {Promise<*>}
   */
  chainCallbackPayload (payload, newPayload) {
    if (this.options.debug.all && this.options.debug.chainListenerCallbacks) {
      console.info(`[vue-hooked-async-events]-169: ${this.options.chainCallbackPayload} payload: %o \nnewPayload: %o`, payload, newPayload);
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
    if (!_.isEmpty(this.events)) {
      if (_.isArray(eventName)) {
        for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
          this.__removeGlobalEvent({ eventName: eventName[eventIndex] });
        }
      } else {
        this.__removeGlobalEvent({ eventName });
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
    // console.debug(`[vue-hooked-async-events]-205: fallSilentProp () compo: %o, eventName: %o, callback: %o`, this, eventName, callback);
    
    if (!_.isEmpty(this.events)) {
      // Unsubscribe component from specific event
      if (!callback && typeof eventName === 'string' && eventName in this.events) {
        // console.debug(`[vue-hooked-async-events]-210: fallSilentProp() - Unsubscribe component from specific event: %o`, this);
        this.__removeListeners({ eventName, subscriberId });
        
        return;
      }
      
      // Unsubscribe component from specific events
      if (!callback && _.isArray(eventName)) {
        // console.debug(`[vue-hooked-async-events]-218: fallSilentProp() - Unsubscribe component from specific events: %o`, this);
        
        for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
          this.__removeListeners({ eventName: eventName[eventIndex], subscriberId });
        }
        
        return;
      }
      
      // Remove array of callbacks for specific event
      if (_.isArray(callback) && eventName in this.events && this.events[eventName].length) {
        // console.debug(`[vue-hooked-async-events]-229: fallSilentProp() - Remove array of callbacks for specific event: %o`, this);
        
        for (let callbackIndex = 0, _len4 = callback.length; callbackIndex < _len4; callbackIndex++) {
          this.__removeCallbacks({ eventName, subscriberId, callback: callback[callbackIndex] });
        }
        
        return;
      }
      
      // Remove specific callback for specific event
      if (callback && eventName in this.events && this.events[eventName].length) {
        // console.debug(`[vue-hooked-async-events]-240: fallSilentProp() - Remove specific callback for specific event: %o`, this);
        
        this.__removeCallbacks({ eventName, subscriberId, callback });
        
        return;
      }
      
      // remove all events in component, since no eventName or callback specified; done automatically
      if (!eventName && !callback) {
        // console.debug(`[vue-hooked-async-events]-249: fallSilentProp() - remove all events in component, since no eventName or callback specified; done automatically: %o`, this);
        for (let eventName in this.events) {
          this.__removeListeners({ eventName, subscriberId });
        }
      }
    }
  }
  
  /**
   * check to see if we have any listener for the given eventID
   * @param {string} eventID - event id to check
   * @param {object} events - events that we should check from
   * @return {boolean}
   */
  hasListener (eventID, events = this.events) {
    return this.hasListeners(eventID, events);
  }
  
  /**
   * check to see if we have any listener for any of the given eventID(s)
   * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
   * @param {object} events - events that we should check from
   * @return {boolean}
   */
  hasListeners (eventIDs, events = this.events) {
    if (!eventIDs) return false;
    if (!_.isArray(eventIDs)) eventIDs = [eventIDs];
    return eventIDs.some(eid => !_.isEmpty(_.get(events, eid)));
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
        this._uniqID = _.uniqueId();
      },
      
      beforeDestroy: function vueHookedAsyncEventsBeforeDestroy () {
        if (this.shouldFallSilent) this[fallSilentProp]();
      },
    });
    
    /**
     * plugin local state
     */
    Vue.prototype[asyncEventsProp] = {
      events:          this.events,
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
     * @return {Promise<*>|array<Promise>}
     */
    Vue.prototype[emitEventProp] = function (eventName, payload, eventOptions) {
      return AE_this.emitEvent(eventName, payload, eventOptions, this);
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
      return AE_this.fallSilent(eventName, callback, this._uniqID);
    };
    
    /**
     * check to see if the component has any listeners for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @param {object} events - async events or lingering events to check for existence from.
     * @param {string} origin - the origin to use (eventOrigin for lingeringEvents and listenerOrigin for events)
     * @param {object} vm - the Vue component to check on
     * @return {boolean}
     */
    function checkComponentEvents (eventIDs, events, origin, vm) {
      if (!eventIDs) return false;
      if (!_.isArray(eventIDs)) eventIDs = [eventIDs];
      let listeners = _.flatten(_.filter(events, (v, k) => eventIDs.includes(k)));
      listeners = _.filter(listeners, (listener) => _.get(listener, `${origin}._uid`) === vm._uid);
      debugger;
      return !!listeners.length;
    }
    
    /**
     * check to see if component has any listener for the given eventID
     * @param {string} eventID - event id to check
     * @return {boolean}
     */
    Vue.prototype[hasListenerProp] = function (eventID) {
      return checkComponentEvents(eventID, AE_this.events, 'listenerOrigin', this);
    };
    /**
     * check to see if the component has any listeners for any of the given eventID(s)
     * @param {Array<string>|string} eventIDs - event ids or just a single event id to check
     * @return {boolean}
     */
    Vue.prototype[hasListenersProp] = function (eventIDs) {
      return checkComponentEvents(eventIDs, AE_this.events, 'listenerOrigin', this);
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
    const exclusiveListener = (this.events[eventName] || []).find(l => l.listenerOptions.isExclusive && l.subscriberId === subscriberId);
    
    // bailout if there is an exclusive listener of the same event name on the component
    if (exclusiveListener && !exclusiveListener.replaceExclusive) {
      if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
        console.info(`[vue-hooked-async-events]-376: ABORTING (exclusive listener exists) ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o Listener Origin: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'));
      }
      // todo we should throw here
      return;
    }
    
    // todo we can add level to add listener options for non-vue usage
    const level = listenerOrigin ? this.__getOriginLevel(listenerOrigin) : 0;
    const id = this.__genUniqID();
    const listener = {
      eventName,
      callback,
      listenerOptions,
      subscriberId,
      listenerOrigin,
      id,
      level,
    };
    
    if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
      console.info(`[vue-hooked-async-events]-394: ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o Listener Origin: %o \nListener: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'), listener);
    }
    
    // noinspection JSIgnoredPromiseFromCall
    this.__runLingeredEvents({ ...arguments[0], listener });
    
    if (!exclusiveListener) {
      (this.events[eventName] || (this.events[eventName] = [])).push(listener);
    } else {
      const index = this.events[eventName].findIndex(l => l.id === exclusiveListener.id);
      this.events[eventName][index] = listener;
    }
    
    if (listenerOptions.expire) {
      setTimeout(async () => {
        // run expiry callback if set, wait for it finish executing if it's async
        if (!!listenerOptions.expiryCallback) await listenerOptions.expiryCallback(listener);
        // noinspection JSCheckFunctionSignatures
        this.__removeListeners({ ...listener });
      }, listenerOptions.expire);
    }
  }
  
  /**
   * Run event callbacks
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @return {Promise<*>}
   */
  async __runEventCallbacks ({ eventName, payload, eventOptions, eventOrigin }) {
    let listeners = this.events[eventName];
    let listenersTally = listeners && listeners.length;
    const level = this.__getOriginLevel(eventOrigin);
    
    let eventMeta = {
      events:         this.events,
      eventName,
      eventTimestamp: Date.now(),
      // make sure we don't mutate the actual eventOptions
      eventOptions: Object.assign({}, eventOptions),
      eventOrigin,
      stopNow:      false,
      level,
      listenersTally,
    };
    
    if (this.options.debug.all && this.options.debug.emitEvent || eventOptions.trace) {
      console.info(`[vue-hooked-async-events]-152: ${this.options.emitEvent} eventName: %o payload: %o\n origin: %o eventMeta: %o`, eventName, payload, _.get(eventOrigin, '$options.name', '???'), eventMeta);
    }
    
    payload = await this.___runEventCallbacks({
      listeners, eventName, payload, eventOptions, eventOrigin, eventMeta,
    });
    
    if (!eventMeta.stopNow) {
      // if event is async then it waits for linger time to elapse before returning the result of catchUp listeners chain
      return this.__lingerEvent({ ...arguments[0], payload, eventMeta });
    } else {
      // catch up listener stopped the event before it went to other existing events.
      return payload;
    }
  }
  
  /**
   *
   * @param [events]
   * @param listeners
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventOrigin
   * @param eventMeta
   * @return {Promise<*>}
   * @private
   */
  async ___runEventCallbacks ({
                                events = this.events,
                                listeners,
                                eventName,
                                payload,
                                eventOptions,
                                eventOrigin,
                                eventMeta,
                              }) {
    let res = payload;
    let listenersTally = listeners && listeners.length;
    
    // console.debug(`[vue-hooked-async-events] index-564: - eventName: %o, \neventOrigin: %o, \n_listeners: %o\neventMeta: %o`, eventName, eventOrigin, listeners, eventMeta);
    
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
        
        // console.debug(`[vue-hooked-async-events]-423: this.___runEventCallbacks() - upListener: %o, downListener: %o`, upListener, downListener);
        
        const upClosestDownListeners = [closestListener, upListener, downListener].filter(l => !_.isNil(l));
        // console.debug(`[vue-hooked-async-events]-426: this.___runEventCallbacks() - upClosestDownListeners: %o`, upClosestDownListeners);
        
        // run both up and down listeners (which ever is available)
        for (let listener of upClosestDownListeners) {
          if (stop || listener.listenerOptions.stopHere) stopHere = true;
          
          if (this.options.debug.all && this.options.debug.invokeListener || eventOptions.trace || listener.listenerOptions.trace) {
            let trace = console.info;
            if (eventOptions.verbose || listener.listenerOptions.verbose) trace = console.trace;
            trace(`[vue-hooked-async-events]-380: Invoke Listener - eventName: %o, payload: %o, \n origin: %o, eventOrigin: %o, Listener: %o\neventMeta: %o\nresponse: %o, \nstoppingHere: %o`, eventName, payload, _.get(listener.listenerOrigin, '$options.name', '???'), _.get(eventOrigin, '$options.name', '???'), listener, eventMeta, res, stopHere);
          }
          
          if (eventOptions.isAsync) {
            res = await this.__runCallback({ events, payload: res, eventMeta, listener });
          } else {
            this.__runCallback({ events, payload: res, eventMeta, listener });
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
    
    return res;
  }
  
  
  /**
   * run given callback
   * @param [events]
   * @param payload
   * @param eventMeta
   * @param listener
   * @return {Promise<*>|undefined}
   */
  __runCallback ({ events = this.events, payload, eventMeta, listener }) {
    // console.debug(`[vue-hooked-async-events] index-397: this.__runCallbacks() - listener: %o`, listener.listenerOrigin._uid);
    
    // make sure we don't mutate the actual listenerOptions
    const listenerOptions = Object.assign({}, listener.listenerOptions);
    
    const { eventName } = eventMeta;
    
    if (listener.listenerOptions.once) {
      this.__removeCallbacks({
        events,
        eventName,
        subscriberId: listener.subscriberId,
        callback:     listener.callback,
      });
    }
    
    return listener.callback(payload, { ...eventMeta, listenerOptions, extra: listenerOptions.extra });
  }
  
  
  /**
   * linger a given event it it's lingerable
   * @param eventName
   * @param payload
   * @param eventOptions
   * @param eventMeta
   */
  __lingerEvent ({ eventName, payload, eventOptions, eventMeta }) {
    if (this.lingeringEvents && (eventOptions.linger || this.options.globalLinger)) {
      // get existing exclusive lingered event
      const exclusiveLingeredEvent = (this.lingeringEvents[eventName] || []).find(e => e.args[1].eventOptions.isExclusive);
      
      // bailout if exclusive lingered event is set to be kept (meaning don't replace with fresh event)
      if (exclusiveLingeredEvent && exclusiveLingeredEvent.keepExclusive) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          let trace = console.info;
          if (eventOptions.verbose) trace = console.trace;
          trace(`[vue-hooked-async-events]-587: ABORTING lingerEvent - for exclusive lingered eventName: %o \n%o`, eventName, eventMeta);
        }
        if (eventOptions.isAsync) {
          return Promise.resolve(payload);
        } else {
          return payload;
        }
      }
      
      if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
        console.info(`[vue-hooked-async-events]-597: lingerEvent - eventName: %o \n%o`, eventName, eventMeta);
      }
      
      const id = this.__genUniqID();
      
      let lingeringHook = undefined, lingeringPromise = undefined, lingeringResult = payload;
      if (eventOptions.isAsync) {
        if (eventOptions.linger >= Infinity || this.options.globalLinger >= Infinity) {
          throw new Error(`[vue-hooked-async-events]-605: You cannot async and linger an event forever!`);
        }
        lingeringPromise = new Promise((resolve) => lingeringHook = resolve);
      }
      
      const event = {
        id,
        lingeringResult,
        lingeringHook, // to be resolved by run callbacks, see this.__runLingeredEvents
        args: [payload, eventMeta],
      };
      // stash event for later use on new listeners of same eventName
      if (!exclusiveLingeredEvent) {
        (this.lingeringEvents[eventName] || (this.lingeringEvents[eventName] = [])).push(event);
      } else {
        const index = this.lingeringEvents[eventName].findIndex(e => e.id === exclusiveLingeredEvent.id);
        this.lingeringEvents[eventName][index] = event;
        // todo if used with Infinity, this creates an event based state updated by emissions and read by once listeners
        //  (may actually create an easy API around this ;D)
        //  you need to somehow make sure payload isn't overwritten, it should merge it. using object.assign I think
      }
      
      // order the splice after linger ms later
      let timeout = eventOptions.linger || this.options.globalLinger;
      if (timeout >= Infinity) timeout = 2147483647; // set to maximum allowed so that we don't have an immediate bailout
      setTimeout(() => {
        // finally resolve lingering event promise
        if (eventOptions.isAsync) {
          lingeringHook(lingeringResult); // finally settle lingering promise
        }
        
        const i = this.lingeringEvents[eventName].findIndex(le => le.id === id);
        this.lingeringEvents[eventName].splice(i, 1);
        
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          console.info(`[vue-hooked-async-events]-640: remove lingerEvent - eventName: %o \n%o`, eventName, eventMeta);
        }
      }, timeout);
      
      
      if (eventOptions.isAsync) {
        return lingeringPromise;
      } else {
        return payload;
      }
    }
  }
  
  
  /**
   * run lingered events for listener (triggered during add listener)
   * @param eventName
   * @param listener
   */
  async __runLingeredEvents ({ eventName, listener }) {
    // check if listener has an events lingering for it, if so then trigger these events on listener to handle
    if (this.lingeringEvents[eventName]) {
      for (let ei in this.lingeringEvents[eventName]) {
        // noinspection JSUnfilteredForInLoop
        const _event = this.lingeringEvents[eventName][ei];
        const [payload, eventMeta] = _event.args;
        const { eventOptions, eventOrigin } = eventMeta;
        
        // was linger ordered by the event or if listener catchUp is within range (linger was ordered by global linger)
        if (eventMeta.linger || listener.listenerOptions.catchUp <= (Date.now() - eventMeta.eventTimestamp)) {
          // noinspection JSIgnoredPromiseFromCall
          let result = await this.___runEventCallbacks({
            events:    [_event],
            payload,
            listeners: [listener],
            eventName,
            eventOptions,
            eventOrigin,
            eventMeta,
          });
          
          if (eventOptions.isAsync) {
            // run event async resolution, see this.__lingerEvent
            _event.lingeringResult = result; // store as the final result to be sent to event
            _event.args[0] = result; // update payload argument for next listener of lingering event
          }
          
          if (eventOptions.forNextOnly) {
            // noinspection JSUnfilteredForInLoop
            this.lingeringEvents[eventName].splice(ei, 1);
          }
        }
      }
    }
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
              throw new Error(`[vue-hooked-async-events] ERROR-562: unknown token: ${token} for range: ${lr} for event: ${eventName}`);
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
    // console.debug(`[vue-hooked-async-events]-603: this.__listenersInRange() - arguments: %o`, arguments[0]);
    
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
   * @param [events]
   * @param eventName
   * @param subscriberId
   * @param id
   */
  __removeListeners ({ events = this.events, eventName, subscriberId, id }) {
    if (!events[eventName]) return;
    
    for (let li = 0; li < events[eventName].length; li++) {
      if (events[eventName][li].subscriberId === subscriberId && (!id || id === events[eventName][li].id)) {
        if (this.options.debug.all && this.options.debug.removeListener || events[eventName][li].listenerOptions.trace) {
          const listener = events[eventName][li];
          const { listenerOrigin } = listener;
          console.info(`[vue-hooked-async-events]-694: ${this.options.fallSilent || '$fallSilent(removeListener)'} eventName: %o origin: %o \nListener: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'), listener);
        }
        
        events[eventName].splice(li, 1);
      }
    }
  }
  
  
  /**
   * remove event callbacks
   * @param [events]
   * @param eventName
   * @param subscriberId
   * @param callback
   */
  __removeCallbacks ({ events = this.events, eventName, subscriberId, callback }) {
    if (!events[eventName]) return;
    
    let indexOfSubscriber = events[eventName].findIndex(function (el) {
      return el.subscriberId === subscriberId && el.callback === callback;
    });
    
    if (~indexOfSubscriber) {
      if (this.options.debug.all && this.options.debug.removeListener || events[eventName][indexOfSubscriber].listenerOptions.trace) {
        const listener = events[eventName][indexOfSubscriber];
        const { listenerOrigin } = listener;
        console.info(`[vue-hooked-async-events]-721: ${this.options.fallSilent || '$fallSilent(this.__removeCallbacks)'} eventName: %o origin: %o \nListener: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'), listener);
      }
      events[eventName].splice(indexOfSubscriber, 1);
    }
    
    if (_.isEmpty(events[eventName])) delete events[eventName];
  }
  
  
  /**
   * remove event and all its callbacks
   * @param eventName
   */
  __removeGlobalEvent ({ eventName }) {
    for (let event in this.events) {
      if (event === eventName) {
        if (this.options.debug.all && this.options.debug.eraseEvent) {
          console.info(`[vue-hooked-async-events]-737: ${this.options.eraseEvent} eventName: %o \nListener: %o`, eventName, this.events[eventName]);
        }
        delete this.events[eventName];
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
      console.warn('[vue-hooked-async-events]: ' + options[prop] + ' is used by Vue. Use another name');
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
    return Math.random().toString(36).substr(2, 9);
  }
}



export default AsyncEvents;



