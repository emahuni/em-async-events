'use strict';

const _ = require('lodash');
const isPromise = require('ispromise');

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
    
    this.options = _.defaultsDeep(options, {
      ...NAMES,
      listenersOptions: {
        extra:               undefined,
        callbacks:           {
          serialExecution:     false,
          debounce:            null,
          throttle:            null,
          isLocallyExclusive:  false,
          isGloballyExclusive: false,
          replaceExclusive:    false,
        },
        stopHere:            false,
        expire:              0,
        expiryCallback:      undefined,
        catchUp:             100, // a value of true will catup whatever lingering event is there.
        once:                false,
        isLocallyExclusive:  false,
        isGloballyExclusive: false,
        replaceExclusive:    false,
        trace:               false,
        verbose:             false,
      },
      eventsOptions:    {
        chain:               false,
        linger:              500,
        bait:                false,
        isLocallyExclusive:  false,
        isGloballyExclusive: false,
        replaceExclusive:    false,
        range:               'first-parent',
        trace:               false,
        verbose:             false,
        rejectUnconsumed:    false,
      },
      
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
   * @param callback
   * @param listenerOptions
   * @param subscriberID
   * @param listenerOrigin
   * @return {Promise|array<Promise>} - allows waiting for invocation of event with a promise only once (use if you want to continue execution where you adding the listener only when promise is fulfilled)
   */
  onEvent (eventName, callback, listenerOptions, subscriberID = this._uniqID, listenerOrigin) {
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
      subscriberID,
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
   * @param subscriberID
   * @param listenerOrigin
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
   * @param payload
   * @param eventOptions
   * @param emitterID
   * @param eventOrigin
   * @return {Promise<*>|array<Promise>}
   */
  emitEvent (eventName, payload, eventOptions, emitterID = this._uniqID, eventOrigin) {
    if (!_.isString(eventName) && !_.isArray(eventName)) throw new Error(`[index]-160: emitEvent() - eventName should be specified as an string or array of strings representing event name(s)!`);
    
    eventOptions = _.merge({}, this.options.eventsOptions, eventOptions);
    
    if (eventOptions.isAsync) this.__showDeprecationWarning('isAsync', 'All events and listeners are now async.');
    
    if (eventOptions.linger === true) {
      eventOptions.linger = Infinity;
    } else if (eventOptions.bait /*&& !eventOptions.linger*/) {
      eventOptions.linger = Infinity;
      // eventOptions.isGloballyExclusive = true;
    }
    
    const eventMeta = {
      eventOrigin,
      emitterID,
      stopNow:     false,
      wasConsumed: false,
    };
    
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
   * @return {Promise<*>}
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
   * @return {array}
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
      
      beforeDestroy: function asyncEventsBeforeDestroy () {
        // noinspection JSUnresolvedVariable
        if (this.toFallSilent$) this[fallSilentProp]();
      },
    });
    
    /**
     * plugin local state
     */
    Vue.prototype[asyncEventsProp] = {
      listeners:       this.listenersStore,
      lingeringEvents: this.lingeringEventsStore,
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
      return AE_this.onEvent(eventName, callback, listenerOptions, this._uid, this);
    };
    
    
    /**
     * add event listener that only listens for event once and removed once executed
     * @param eventName
     * @param callback
     * @param listenerOptions
     */
    Vue.prototype[onceEventProp] = function (eventName, callback, listenerOptions) {
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
   */
  __addListener ({ eventName, callback, listenerOptions, subscriberID, listenerOrigin }) {
    let isExclusiveCallbackListener = false;
    const exclusiveListener = (this.listenersStore[eventName] || []).find(l => this.__isExclusiveListener(l, subscriberID) || this.__isExclusiveCallback(callback, l, subscriberID) && (isExclusiveCallbackListener = true));
    
    // bailout if there is an exclusive listener of the same event name on the component
    if (exclusiveListener && (!isExclusiveCallbackListener && !listenerOptions.replaceExclusive || isExclusiveCallbackListener && !listenerOptions.callbacks.replaceExclusive)) {
      if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
        console.warn(`[em-async-events]-593: ABORTING (exclusive ${(isExclusiveCallbackListener ? 'callback' : 'listener')} exists) ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o Exclusive Listener Origin: %o, Requesting Origin: %o`, eventName, _.get(exclusiveListener.listenerOrigin, '$options.name', '???'), _.get(listenerOrigin, '$options.name', '???'));
        if (listenerOptions.verbose) {
          console.groupCollapsed('exclusive Listener verbose:');
          console.info('Exclusive Listener:');
          console.table(exclusiveListener);
          console.groupEnd();
        }
      }
      throw new Error(`[index]-595: __addListener() - ABORTING (exclusive ${(isExclusiveCallbackListener ? 'callback' : 'listener')} exists)`);
    }
    
    // todo we can add level to add listener options for non-vue usage
    const level = listenerOrigin ? this.__getOriginLevel(listenerOrigin) : 0;
    // create a promise that can be waited for by listener
    const listenerPromise = this.__createPromise();
    
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
    
    // create listener object
    const listener = {
      eventName,
      callback:  _.get(exclusiveListener, 'callback', callback),
      listenerOptions,
      subscriberID,
      listenerOrigin,
      listenerPromise,
      id:        this.__genUniqID(),
      level,
      timestamp: Date.now(),
      calls:     [],
    };
    
    if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
      console.warn(`[em-async-events]-394: ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o Listener Origin: %o`, eventName, _.get(listenerOrigin, '$options.name', '???'));
      if (listenerOptions.verbose) {
        console.groupCollapsed('addListener verbose:');
        console.info('Listener:');
        console.table(listener);
        console.groupEnd();
      }
    }
    
    // results that happen here will be sent thru the listener promise chain.
    this.__invokeLingeredEventsAtAddListener({ eventName, listener });
    
    // only add to listeners if the it's not once or isn't settled yet.
    if (!listenerOptions.once || listener.listenerPromise.settlement === PENDING) {
      this.__stashListenerOrEvent(listener, eventName, this.listenersStore, exclusiveListener);
      
      if (listenerOptions.expire) {
        setTimeout(() => {
          if (!!listenerOptions.expiryCallback) listenerOptions.expiryCallback(listener);
          else {
            if (this.options.debug.all && this.options.debug.addListener || listenerOptions.trace) {
              console.info(`[em-async-events]-627: ${listenerOptions.once ? this.options.onceEvent : this.options.onEvent}(addListener) eventName: %o has no expiryCallback...`, eventName);
              if (listenerOptions.verbose) {
                console.groupCollapsed('addListener verbose:');
                console.info('Listener:');
                console.table(listener);
                console.groupEnd();
              }
            }
          }
          // noinspection JSCheckFunctionSignatures
          this.__removeListeners({ ...listener });
        }, listenerOptions.expire);
      }
    }
    
    // console.debug(`[index]-622: __addListener() - listener subscriberID: %o, outcome: %o, settlement: %o`, listener.subscriberID, listener.listenerPromise.outcome, listener.listenerPromise.settlement);
    return listener.listenerPromise.promise;
  }
  
  /**
   * check if listener is exclusive
   * @param listener
   * @param subscriberID
   * @return {*|boolean|boolean}
   * @private
   */
  __isExclusiveListener (listener, subscriberID) {
    return listener.listenerOptions.isGloballyExclusive || listener.listenerOptions.isLocallyExclusive && listener.subscriberID === subscriberID;
  }
  
  /**
   * check if listener callback is exclusive
   * @param listener
   * @param subscriberID
   * @return {false|*|boolean|boolean}
   * @private
   */
  __isExclusiveListenerCallback (listener, subscriberID) {
    return listener.listenerOptions.callbacks.isGloballyExclusive || listener.listenerOptions.callbacks.isLocallyExclusive && listener.subscriberID === subscriberID;
  }
  
  /**
   * check if this is an exclusive callback
   * @param callback
   * @param listener
   * @param subscriberID
   * @return {false|*|boolean}
   * @private
   */
  __isExclusiveCallback (callback, listener, subscriberID) {
    return callback === listener.callback && this.__isExclusiveListenerCallback(listener, subscriberID);
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
  __runEvent_linger ({ eventName, payload, eventOptions, eventOrigin, eventMeta }) {
    /** run event */
    let listeners = this.listenersStore[eventName];
    let listenersTally = listeners && listeners.length;
    const level = this.__getOriginLevel(eventOrigin);
    
    _.merge(eventMeta, {
      id:             this.__genUniqID(),
      eventName,
      consumers:      [],
      payloads:       [payload],
      eventTimestamp: Date.now(),
      eventOptions:   _.cloneDeep(eventOptions),
      level,
      listenersTally,
    });
    
    if (this.options.debug.all && this.options.debug.emitEvent || eventOptions.trace) {
      console.warn(`[em-async-events]-152: ${this.options.emitEvent} eventName: %o payload: %o\n origin: %o`, eventName, payload, _.get(eventOrigin, '$options.name', '???'));
      if (eventOptions.verbose) {
        console.groupCollapsed('__runEvent_linger verbose:');
        console.info('eventMeta:');
        console.table(eventMeta);
        console.groupEnd();
      }
    }
    
    payload = this.__runListeners({
      listeners, eventName, payload, eventOptions, eventOrigin, eventMeta,
    });
    
    
    
    /** linger */
    if (!eventMeta.stopNow) {
      return this.__lingerEvent({
        eventName, payload: _.last(eventMeta.payloads), eventOptions, eventMeta,
      });
    } else {
      if (!eventMeta.wasConsumed) {
        if (this.options.debug.all && this.options.debug.emitEvent || eventOptions.trace) {
          console.warn(`[em-async-events]-660: - eventName: %o wasn't consumed! Check the event name correctness, or adjust its "linger" time or the listeners' "catchUp" time to bust event race conditions.`, eventName);
          if (eventOptions.verbose) {
            console.groupCollapsed('event verbose:');
            console.info('eventMeta:');
            console.table(eventMeta);
            console.groupEnd();
          }
        }
        
        // todo use createPromise promise.resolve()/reject() then return the promise object for all returned promises to maintain a uniform response. make a __resolvePromise, __rejectPromise private method that handles these
        if (eventOptions.rejectUnconsumed) return Promise.reject(`Event "${eventName}" NOT consumed!`);
        else return Promise.resolve();
      } else {
        return Promise.resolve(payload);
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
   * @return {Promise<*>}
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
    let finalOutcome;
    let listenersTally = listeners && listeners.length;
    
    // console.debug(`[em-async-events] index-564: - eventName: %o, \neventOrigin: %o, \n_listeners: %o\neventMeta: %o`, eventName, eventOrigin, listeners, eventMeta);
    
    if (listenersTally) {
      let stop;
      
      if (!!eventOrigin) {
        ({ listeners, stop } = this.__getListenersInRange({
          ...arguments[0],
          eventLevel: eventMeta.level,
        }));
      }
      
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
        
        if (this.options.debug.all && this.options.debug.invokeListener || eventOptions.trace || listener.listenerOptions.trace) {
          console.warn(`[em-async-events]-380: Invoke Listener - eventName: %o, payload: %o, \n listener origin: %o, eventOrigin: %o,\nresponse: %o, \nstoppingHere: %o`, eventName, payload, _.get(listener.listenerOrigin, '$options.name', '???'), _.get(eventOrigin, '$options.name', '???'), finalOutcome, stopHere);
          if (eventOptions.verbose || listener.listenerOptions.verbose) {
            console.groupCollapsed('Listener verbose:');
            console.info('Listener:');
            console.table(listener);
            console.info('eventMeta:');
            console.table(eventMeta);
            console.groupEnd();
          }
        }
        
        const callbackPromise = this.__createPromise();
        try {
          if (_.isFunction(listener.callback)) {
            //  check if calls has anything and if we should be doing serial execution
            if (listener.calls.length && listener.listenerOptions.callbacks.serialExecution) {
              finalOutcome = Promise.all(listener.calls.map(c => c.promise))
                                    .then((outcome) => {
                                      // todo how should we use outcome here?
                                      return this.__runCallbackPromise(listener, callbackPromise, payload, eventMeta);
                                    });
            } else {
              finalOutcome = this.__runCallbackPromise(listener, callbackPromise, payload, eventMeta);
            }
            
            if (eventMeta.chain) payload = finalOutcome;
          }
        } catch (e) {
          // todo error handling ?
          callbackPromise.settlement = REJECTED;
          callbackPromise.outcome = finalOutcome;
          if (listener.listenerPromise.settlement === PENDING) {
            listener.listenerPromise.settlement = REJECTED;
            // rejects with previous finalOutcome.
            listener.listenerPromise.reject(e);
            listener.listenerPromise.outcome = finalOutcome;
          }
        }
        
        
        if (listener.listenerOptions.once && listener.listenerPromise.settlement !== PENDING) {
          this.__removeCallbacks({
            eventName,
            subscriberID: listener.subscriberID,
            callback:     listener.callback,
          });
        }
        
        if (stopHere) {
          eventMeta.stopNow = true;
          break;
        }
      }
    }
    
    return finalOutcome;
  }
  
  /**
   * run listener callback promise
   * @param listener
   * @param callbackPromise
   * @param payload
   * @param eventMeta
   * @return {*}
   * @private
   */
  __runCallbackPromise (listener, callbackPromise, payload, eventMeta) {
    listener.calls.push(callbackPromise);
    
    eventMeta.wasConsumed = true;
    
    // todo should we replace exclusive listeners?
    // const exclusiveListener = this.__getExclusiveListener(listener.eventName, this.listenersStore); // todo ???
    
    // keep track of lingering event listeners where we can track them in userland. todo clean all resolved listeners when we reach maxCacheCount (rename maxCachedPayloads to this and reuse everywhere we need cache things (Infinite events can gobble memory if uncleared)) todo create userland utils to check events and listeners promise statuses.
    eventMeta.consumers.push(listener);
    
    
    /** do the actual call of the callback */
    let finalOutcome = listener.callback(payload, {
      extra:        listener.listenerOptions.extra,
      eventMeta,
      listenerMeta: listener,
      call_id:      callbackPromise.id,
    });
    
    
    if (isPromise(finalOutcome)) {
      // todo check error handling of promise here
      // noinspection BadExpressionStatementJS
      return finalOutcome.then((outcome) => {
        if (listener.listenerOptions.once) this.__removeListeners({ ...listener });
        return this.__settleCallbackPromise(listener, callbackPromise, outcome, eventMeta);
      });
    } else {
      return this.__settleCallbackPromise(listener, callbackPromise, finalOutcome, eventMeta);
    }
  }
  
  /**
   * Settle callback promise
   * @param listener
   * @param callbackPromise
   * @param outcome
   * @param eventMeta
   * @return {*}
   * @private
   */
  __settleCallbackPromise (listener, callbackPromise, outcome, eventMeta) {
    callbackPromise.settlement = RESOLVED;
    callbackPromise.resolve(outcome);
    
    // only capture the first outcome becoz that's what promises do, once resolved or rejected it's settled.
    if (listener.listenerPromise.settlement === PENDING) {
      listener.listenerPromise.outcome = outcome;
      listener.listenerPromise.settlement = RESOLVED;
      listener.listenerPromise.resolve(outcome);
    }
    
    eventMeta.payloads.push(outcome);
    if (eventMeta.payloads.length >= this.options.maxCachedPayloads) eventMeta.payloads.shift();
    
    listener.calls.splice(_.findIndex(listener.calls, c => c.id === callbackPromise.id), 1);
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
      // get existing exclusive lingered event
      let exclusiveLingeredEvent = this.__getExclusiveEvent(eventMeta, this.lingeringEventsStore);
      
      // bailout if exclusive lingered event is set to be kept (meaning don't replace with fresh event)
      if (exclusiveLingeredEvent && !exclusiveLingeredEvent.replaceExclusive) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          console.warn(`[em-async-events]-587: ABORTING lingerEvent - for exclusive lingered eventName: %o`, eventName);
          if (eventOptions.verbose) {
            console.groupCollapsed('ABORTING lingerEvent verbose:');
            console.info('eventMeta:');
            console.table(eventMeta);
            console.groupEnd();
          }
        }
        
        return exclusiveLingeredEvent.lingeringEventPromise.resolve(payload);
      }
      
      // bailout if baited but consumed event
      if (eventMeta.wasConsumed && eventOptions.bait) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          console.warn(`[em-async-events]-827: ABORTING lingerEvent - baited but consumed eventName: %o`, eventName);
          if (eventOptions.verbose) {
            console.groupCollapsed('ABORTING lingerEvent verbose:');
            console.info('eventMeta:');
            console.table(eventMeta);
            console.groupEnd();
          }
        }
        
        return Promise.resolve(payload);
      }
      
      if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
        console.warn(`[em-async-events]-597: lingerEvent - eventName: %o for %o (ms)`, eventName, eventOptions.linger);
        if (eventOptions.verbose) {
          console.groupCollapsed('lingerEvent verbose:');
          console.info('eventMeta:');
          console.table(eventMeta);
          console.groupEnd();
        }
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
      
      return ev.lingeringEventPromise.promise;
    }
    
    if (eventMeta.wasConsumed) return Promise.resolve(payload);
    else if (eventOptions.rejectUnconsumed) return Promise.reject(`Un-lingered Event "${eventName}" was NOT consumed!`);
    
    return Promise.resolve();
  }
  
  
  __decayLingeredEvent (ev, eventName, eventOptions) {
    // order the splice after linger ms later
    let timeout = eventOptions.linger;
    if (timeout >= Infinity) timeout = 2147483647; // set to maximum allowed so that we don't have an immediate bailout
    
    setTimeout((e) => {
      const consumers = this.pendingEventConsumers(ev);
      if (consumers.length) {
        if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
          console.warn(`[em-async-events]-1005: - eventName: %o "linger" time has run out whilst it's still being consumed. It is removed, but its promise will be settled once the consumers finish.`, eventName);
          if (eventOptions.verbose) {
            console.groupCollapsed('Consumers verbose:');
            console.info('Consumers:');
            console.table(consumers);
            console.info('eventMeta:');
            console.table(ev.eventMeta);
            console.groupEnd();
          }
        }
        
        Promise.all(consumers.map(c => c.listenerPromise.promise)).then((vows) => {
          // console.debug(`[index]-1011: () - vows: %o`, vows);
          this.__settleLingeredEvent(ev, eventOptions, eventName);
          if (consumers.length && this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
            console.warn(`[em-async-events]-1016: - eventName: %o "linger" consumers have finished.`, eventName);
            if (eventOptions.verbose) {
              console.groupCollapsed('"linger" consumers verbose:');
              console.info('Consumers:');
              console.table(consumers);
              console.info('eventMeta:');
              console.table(ev.eventMeta);
              console.groupEnd();
            }
          }
        });
      } else {
        this.__settleLingeredEvent(ev, eventOptions, eventName);
      }
      
      const i = this.lingeringEventsStore[eventName].findIndex(le => le.id === ev.id);
      this.__removeLingeringEventAtIndex(eventName, i, eventOptions, ev.eventMeta);
    }, timeout, ev);
  }
  
  __settleLingeredEvent (ev, eventOptions, eventName) {
    // finally resolve/reject lingering event promise
    if (ev.eventMeta.wasConsumed) {
      ev.lingeringEventPromise.resolve(ev.payload);
    } else {
      if (eventOptions.rejectUnconsumed) ev.lingeringEventPromise.reject(`Lingered Event "${eventName}" NOT consumed!`);
      else ev.lingeringEventPromise.resolve();
    }
  }
  
  __eventConsumers (ev) {
    if (!_.isArray(ev)) ev = [ev];
    return _.flatten(ev.map(l => l.eventMeta.consumers));
  }
  
  __eventConsumersAtState (ev, state) {
    const consumers = this.__eventConsumers(ev);
    if (_.isNil(state)) return consumers;
    return consumers.filter(c => c.listenerPromise.settlement === state);
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
    // console.debug(`[index]-908: __invokeLingeredEventsAtAddListener() - listener subscriberID: %o, hasLingeringEvent? %o, catchUp? %o`, listener.subscriberID, this.hasLingeringEvents(eventName), !!listener.listenerOptions.catchUp);
    // check if listener has an events lingering for it, if so then trigger these events on listener to handle
    if (!!listener.listenerOptions.catchUp && this.hasLingeringEvents(eventName)) {
      for (let ei in this.lingeringEventsStore[eventName]) {
        // noinspection JSUnfilteredForInLoop
        const lingeringEvent = this.lingeringEventsStore[eventName][ei];
        let { payload, eventMeta } = lingeringEvent;
        
        // is listener catchUp within range?
        const elapsed = Date.now() - eventMeta.eventTimestamp;
        if (listener.listenerOptions.catchUp === true || listener.listenerOptions.catchUp >= elapsed) {
          const { eventOptions, eventOrigin } = eventMeta;
          // the reason here is that we need it to pass thru the levels logic too
          payload = this.__runListeners({
            payload,
            listeners: [listener],
            eventName,
            eventOptions,
            eventOrigin,
            eventMeta,
          });
          
          if (eventMeta.wasConsumed) {
            lingeringEvent.payload = payload;
            
            // todo bait logic should be done only when all listeners have taken the bait, since we can add multiple listeners per onEvent/onceEvent
            if (eventOptions.bait) {
              lingeringEvent.lingeringEventPromise.settlement = RESOLVED;
              lingeringEvent.lingeringEventPromise.resolve(payload);
              // noinspection JSUnfilteredForInLoop
              this.__removeLingeringEventAtIndex(eventName, ei, eventOptions, eventMeta);
            }
          }
        } else {
          if (this.options.debug.all && this.options.debug.addListener || listener.listenerOptions.trace) {
            console.warn(`[em-async-events]-948: ${listener.listenerOptions.once ? this.options.onceEvent : this.options.onEvent} couldn't "catchUp" to a currently lingering lingeringEvent "%o". Please adjust listener options catchUp time from: %o to something greater than %o if this is desired.`, eventName, listener.listenerOptions.catchUp, elapsed);
            if (listener.listenerOptions.verbose) {
              console.groupCollapsed('catchUp verbose:');
              console.info('Listener:');
              console.table(listener);
              console.groupEnd();
            }
          }
        }
      }
    }
  }
  
  __removeLingeringEventAtIndex (eventName, index, eventOptions, eventMeta) {
    if (this.options.debug.all && this.options.debug.lingerEvent || eventOptions.trace) {
      console.info(`[em-async-events]-911: remove lingerEvent - eventName: %o on index: %o`, eventName, index);
      
      if (!eventMeta.wasConsumed) {
        console.warn(`[em-async-events]-924: - Lingered eventName: %o wasn't consumed! Check the event name correctness, or adjust its "linger" time or the listeners' "catchUp" time to bust event race conditions.`, eventName);
      }
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
   */
  __getListenersInRange ({ eventName, eventMeta, eventOptions, eventOrigin, listeners, eventLevel }) {
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
        /**
         * serve listeners in the same component as emitter ONLY
         * @type {boolean}
         */
        selfOnly = null,
        /**
         * serve listeners in the same component as emitter AS WELL
         * @type {boolean}
         */
        self = null,
        /**
         * serve listeners on the same component as emitter ONLY
         * @type {boolean}
         */
        siblings = null;
    
    const lr = eventOptions.range || 'broadcast';
    
    if (lr.includes('self_only') || lr === 'self') {
      selfOnly = true;
    } else {
      let tokens = lr.split(/[- ,;]/);
      for (let token of tokens) {
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
        if (this.options.debug.all && this.options.debug.removeListener || this.listenersStore[eventName][li].listenerOptions.trace) {
          const listener = this.listenersStore[eventName][li];
          const { listenerOrigin, listenerOptions } = listener;
          console.warn(`[em-async-events]-694: ${this.options.fallSilent || '$fallSilent(removeListener)'} eventName: %o origin: %o `, eventName, _.get(listenerOrigin, '$options.name', '???'));
          if (listenerOptions.verbose) {
            console.groupCollapsed('removeListener verbose:');
            console.info('Listener:');
            console.table(listener);
            console.groupEnd();
          }
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
      if (this.options.debug.all && this.options.debug.removeListener || this.listenersStore[eventName][indexOfSubscriber].listenerOptions.trace) {
        const listener = this.listenersStore[eventName][indexOfSubscriber];
        const { listenerOrigin, listenerOptions } = listener;
        console.warn(`[em-async-events]-721: ${this.options.fallSilent || '$fallSilent(this.__removeCallbacks)'} eventName: %o origin: %o `, eventName, _.get(listenerOrigin, '$options.name', '???'));
        if (listenerOptions.verbose) {
          console.groupCollapsed('__removeCallbacks verbose:');
          console.info('Listener:');
          console.table(listener);
          console.groupEnd();
        }
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
    for (let event in this.listenersStore) {
      if (event === eventName) {
        if (this.options.debug.all && this.options.debug.eraseEvent || event.eventMeta.eventOptions.trace) {
          console.warn(`[em-async-events]-737: ${this.options.eraseEvent} eventName: %o`, eventName);
          if (event.eventMeta.eventOptions.verbose) {
            console.groupCollapsed('__removeAllListeners verbose:');
            console.info('Listeners:');
            console.table(this.listenersStore[eventName]);
            console.groupEnd();
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
    return _.uniqueId(Math.random().toString(36).substr(2, 9));
  }
  
  __showDeprecationWarning (dep, extra) {
    console.warn(`${dep} was deprecated and no longer supported. ${extra || ''}`);
  }
  
  /**
   * create a promise to keep track of what is going on
   * @return {{resolve, reject, promise: Promise, id: string, outcome: undefined, settlement: number}}
   * @private
   */
  __createPromise () {
    let _RESOLVE, _REJECT;
    const promise = new Promise((resolve, reject) => {
      _RESOLVE = resolve;
      _REJECT = reject;
    });
    
    // we can use this in userland to figure out if promise is settled etc
    return _.merge(promise, {
      id:         this.__genUniqID(),
      promise,
      resolve:    _RESOLVE,
      reject:     _REJECT,
      settlement: PENDING,
      outcome:    undefined,
    });
  }
}



module.exports = AsyncEvents;



