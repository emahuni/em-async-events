'use strict';

let OPTIONS;

export default {
  /**
   * install plugin
   * @param Vue
   * @param options
   */
  install: function install (Vue, options) {
    options = Object.assign({
      listenersOptions: {
        extra:          undefined,
        stopHere:       false,
        expire:         0,
        expiryCallback: undefined,
        catchUp:        0,
        once:           false,
        isAsync:        false,
        trace:          false
      },
      eventsOptions:    {
        linger:       0,
        lingerForOne: false,
        isAsync:      false,
        range:        'first-parent',
        trace:        false
      },

      globalLinger: 500,

      debug: {
        all:                    false,
        addListener:            true,
        emitEvent:              true,
        eraseEvent:             true,
        invokeListener:         true,
        lingerEvent:            true,
        chainListenerCallbacks: true,
        removeListener:         true
      }
    }, options);

    // turn off debuggin if we are not going to show devtools/in production
    if (!Vue.config.devtools) options.debug.all = false;

    OPTIONS = options;

    let asyncEventsProp = isCorrectCustomName('asyncEvents', options) || '$asyncEvents';
    let onEventProp = isCorrectCustomName('onEvent', options) || '$onEvent';
    let onceEventProp = isCorrectCustomName('onceEvent', options) || '$onceEvent';
    let emitEventProp = isCorrectCustomName('emitEvent', options) || '$emitEvent';
    let eraseEventProp = isCorrectCustomName('eraseEvent', options) || '$eraseEvent';
    let fallSilentProp = isCorrectCustomName('fallSilent', options) || '$fallSilent';
    let chainCallbackPayloadProp = isCorrectCustomName('chainCallbackPayload', options) || '$chainCallbackPayload';
    let defaultListenerOptions = options.listenersOptions;
    let defaultEventOptions = options.eventsOptions;


    /**
     * mix into vue
     */
    Vue.mixin({
      data () {
        return {
          shouldFallSilent: true
        };
      },
      beforeCreate: function vueHookedAsyncEventsBeforeCreate () {
        this._uniqID = genUniqID();
      },

      beforeDestroy: function vueHookedAsyncEventsBeforeDestroy () {
        if (this.shouldFallSilent) this.$fallSilent();
      }
    });

    /**
     * plugin local state
     * @type {{_events: {}}}
     */
    Vue.prototype[asyncEventsProp] = { _events: {}, _lingeringEvents: {}, options };
    let events = Vue.prototype[asyncEventsProp]._events;
    let lingeringEvents = Vue.prototype[asyncEventsProp]._lingeringEvents;

    /**
     * add event listener
     * @param eventName
     * @param callback
     * @param listenerOptions
     * @param subscriberId
     * @param listenerOrigin
     */
    Vue.prototype[onEventProp] = function (eventName, callback, listenerOptions, subscriberId = this._uniqID, listenerOrigin = this) {
      listenerOptions = Object.assign({}, defaultListenerOptions, listenerOptions);

      if (listenerOptions.isAsync && !listenerOptions.once) {
        throw new Error(`[vue-hooked-async-events]-99: Cannot use isAsync with non-once event listeners. Consider using a callback that re-listens for the same same event instead.`);
      }

      const args = {
        eventName,
        callback,
        events,
        lingeringEvents,
        subscriberId,
        listenerOrigin,
        listenerOptions
      };

      if (isArray(eventName) && isArray(callback)) {
        for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
          for (let callbackIndex = 0, _len = callback.length; callbackIndex < _len; callbackIndex++) {
            addListener({
              ...args,
              eventName: eventName[eventNameIndex],
              callback:  callback[callbackIndex]
            });
          }
        }

        return;
      }

      if (isArray(eventName)) {
        for (let _eventNameIndex = 0, _len2 = eventName.length; _eventNameIndex < _len2; _eventNameIndex++) {
          addListener({
            ...args,
            eventName: eventName[_eventNameIndex]
          });
        }

        return;
      }

      if (isArray(callback)) {
        for (let _callbackIndex = 0, _len3 = callback.length; _callbackIndex < _len3; _callbackIndex++) {
          addListener({
            ...args,
            callback: callback[_callbackIndex]
          });
        }
      } else {
        addListener({
          ...args
        });
      }
    };


    /**
     * add event listener that only listens for event once and removed once executed
     * @param eventName
     * @param callback
     * @param listenerOptions
     */
    Vue.prototype[onceEventProp] = function (eventName, callback, listenerOptions) {
      if (typeof callback !== 'function' && !listenerOptions) {
        listenerOptions = callback;
        callback = undefined;
      }

      listenerOptions = Object.assign({}, defaultListenerOptions, listenerOptions);

      listenerOptions.once = true;

      /**
       * creates a listener
       * @param cb
       */
      const createListener = (cb) => {
        Vue.prototype[onEventProp](eventName, cb, listenerOptions, this._uniqID, this);
      };

      // this can be used to wait for listener to trigger before proceeding with code below where listener was created
      if (listenerOptions.isAsync) {
        if (Array.isArray(callback)) {
          throw new Error(`[vue-hooked-async-events]-179: You cannot use isAsync listener with atomic API (multiple callbacks)`);
        }

        /**
         * override the callback with one that will return to the listener origin
         * - it's async just in case the original is also async (one that returns results to event emitter)
         */
        return new Promise(resolve => createListener(async (...args) => resolve(!!callback ? await callback(...args) : args[0])));
      } else {
        // just create a listener normally
        createListener(callback);
      }

    };

    /**
     * emit event and run callbacks subscribed to the event
     * @param eventName
     * @param payload
     * @param eventOptions
     * @return {Promise<*>|array<Promise>}
     */
    Vue.prototype[emitEventProp] = function (eventName, payload, eventOptions) {
      eventOptions = Object.assign({}, defaultEventOptions, eventOptions);

      const args = {
        events,
        lingeringEvents,
        eventName,
        payload,
        eventOrigin: this,
        eventOptions
      };

      let promises = [];
      /*
       // this wont work if payload is actually a response in array form
       if (isArray(eventName) && isArray(payload)) {
       for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
       for (let payloadIndex = 0, _len = payload.length; payloadIndex < _len; payloadIndex++) {
       promises.push(runEventCallbacks({
       ...args,
       eventName: eventName[eventNameIndex],
       payload:  payload[payloadIndex]
       }));
       }
       }

       return promises;
       }
       */

      if (isArray(eventName)) {
        for (let _eventNameIndex = 0, _len2 = eventName.length; _eventNameIndex < _len2; _eventNameIndex++) {
          promises.push(runEventCallbacks({
            ...args,
            eventName: eventName[_eventNameIndex],
            payload
          }));
        }

        return promises;
      }


      return runEventCallbacks({
        ...args
      });
    };

    /**
     * chain listeners results
     * @param payload
     * @param newPayload
     * @return {Promise<*>}
     */
    Vue.prototype[chainCallbackPayloadProp] = function (payload, newPayload) {
      if (OPTIONS.debug.all && OPTIONS.debug.chainListenerCallbacks) {
        console.debug(`[vue-hooked-async-events]-169: ${chainCallbackPayloadProp} payload: %o \nnewPayload: %o`, payload, newPayload);
      }

      // see if there is any callback that already prepared the results chain if not create it
      payload = (payload && Array.isArray(payload.$results$) && payload || { $results$: [] });
      payload.$results$.push(newPayload);
      return payload;
    };

    /**
     * remove event from events object
     * @param eventName
     */
    Vue.prototype[eraseEventProp] = function (eventName) {
      if (!isEmpty(events)) {
        if (isArray(eventName)) {
          for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
            removeGlobalEvent({ events, eventName: eventName[eventIndex] });
          }
        } else {
          removeGlobalEvent({ events, eventName });
        }
      }
    };

    /**
     * unsubscribe from subscriptions
     * @param eventName {string|Array<string>|undefined} - event name of events/listeners to unsubscribe
     * @param callback {Function|Array<Function>|undefined} the callback/Array of callbacks that should be unsubscribed
     */
    Vue.prototype[fallSilentProp] = function (eventName, callback) {
      const subscriberId = this._uniqID;

      // console.debug(`[vue-hooked-async-events]-205: fallSilentProp () compo: %o, eventName: %o, callback: %o`, this, eventName, callback);

      if (!isEmpty(events)) {
        // Unsubscribe component from specific event
        if (!callback && typeof eventName === 'string' && eventName in events) {
          // console.debug(`[vue-hooked-async-events]-210: fallSilentProp() - Unsubscribe component from specific event: %o`, this);
          removeListeners({ events, eventName, subscriberId });

          return;
        }

        // Unsubscribe component from specific events
        if (!callback && isArray(eventName)) {
          // console.debug(`[vue-hooked-async-events]-218: fallSilentProp() - Unsubscribe component from specific events: %o`, this);

          for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
            removeListeners({ events, eventName: eventName[eventIndex], subscriberId });
          }

          return;
        }

        // Remove array of callbacks for specific event
        if (isArray(callback) && eventName in events && events[eventName].length) {
          // console.debug(`[vue-hooked-async-events]-229: fallSilentProp() - Remove array of callbacks for specific event: %o`, this);

          for (let callbackIndex = 0, _len4 = callback.length; callbackIndex < _len4; callbackIndex++) {
            removeCallbacks({ events, eventName, subscriberId, callback: callback[callbackIndex] });
          }

          return;
        }

        // Remove specific callback for specific event
        if (callback && eventName in events && events[eventName].length) {
          // console.debug(`[vue-hooked-async-events]-240: fallSilentProp() - Remove specific callback for specific event: %o`, this);

          removeCallbacks({ events, eventName, subscriberId, callback });

          return;
        }

        // remove all events in component, since no eventName or callback specified; done automatically
        if (!eventName && !callback) {
          // console.debug(`[vue-hooked-async-events]-249: fallSilentProp() - remove all events in component, since no eventName or callback specified; done automatically: %o`, this);
          for (let eventName in events) {
            removeListeners({ events, eventName, subscriberId });
          }
        }
      }
    };
  }
};



/**
 * Add event listener
 * @param events
 * @param lingeringEvents
 * @param eventName
 * @param subscriberId
 * @param callback
 * @param listenerOptions
 * @param listenerOrigin
 */
function addListener ({ events, lingeringEvents, eventName, subscriberId, callback, listenerOptions, listenerOrigin }) {
  const level = getOriginLevel(listenerOrigin);
  const listener = {
    eventName,
    subscriberId,
    listenerOrigin,
    listenerOptions,
    callback,
    level
  };

  if (OPTIONS.debug.all && OPTIONS.debug.addListener || listenerOptions.trace) {
    console.debug(`[vue-hooked-async-events]-321: ${listenerOptions.once ? (OPTIONS.onceEvent || '$onceEvent(addListener)') : (OPTIONS.onEvent || '$onEvent(addListener)')} eventName: %o origin: %o \nListener: %o`, eventName, listenerOrigin && listenerOrigin.$options && listenerOrigin.$options.name || '???', listener);
  }

  // noinspection JSIgnoredPromiseFromCall
  runLingeredEvents({ ...arguments[0], listener });

  (events[eventName] || (events[eventName] = [])).push(listener);

  if (listenerOptions.expire) {
    setTimeout(async (...args) => {
      // run expiry callback if set, wait for it finish executing if it's async
      if (!!listenerOptions.expiryCallback) await listenerOptions.expiryCallback(...args);
      // noinspection JSCheckFunctionSignatures
      removeListeners(...args);
    }, listenerOptions.expire, ...arguments);
  }
}

/**
 * get the component hierachy level of a given Vue component
 * @param origin
 * @return {number}
 */
function getOriginLevel (origin) {
  let level = 0, compo = origin;
  while (compo && compo.$parent) {
    level++;
    compo = compo.$parent;
  }
  return level;
}

/**
 * Run event callbacks
 * @param events
 * @param lingeringEvents
 * @param eventName
 * @param payload
 * @param eventOptions
 * @param eventOrigin
 * @return {Promise<*>}
 */
async function runEventCallbacks ({ eventName, eventOptions, eventOrigin, events, lingeringEvents, payload }) {
  let listeners = events && events[eventName];
  let listenersTally = listeners && listeners.length;
  const level = getOriginLevel(eventOrigin);

  let eventMeta = {
    events,
    eventName,
    eventTimestamp: Date.now(),
    // make sure we don't mutate the actual eventOptions
    eventOptions:   Object.assign({}, eventOptions),
    eventOrigin,
    stopNow:        false,
    level,
    listenersTally
  };

  if (OPTIONS.debug.all && OPTIONS.debug.emitEvent || eventOptions.trace) {
    console.debug(`[vue-hooked-async-events]-152: ${OPTIONS.emitEvent || '$emitEvent'} eventName: %o origin: %o \npayload: %o\neventMeta: %o`, eventName, eventOrigin && eventOrigin.$options && eventOrigin.$options.name || '???', payload, eventMeta);
  }

  payload = await _runEventCallbacks({ events, listeners, eventName, payload, eventOptions, eventOrigin, eventMeta });

  if (!eventMeta.stopNow) {
    // if event is async then it waits for linger time to elapse before returning the result of catchUp listeners chain
    return lingerEvent({ ...arguments[0], eventMeta, payload });
  } else {
    // catch up listener stopped the event before it went to other existing events.
    return payload;
  }
}

/**
 *
 * @param events
 * @param listeners
 * @param eventName
 * @param payload
 * @param eventOptions
 * @param eventOrigin
 * @param eventMeta
 * @return {Promise<*>}
 * @private
 */
async function _runEventCallbacks ({ events, eventName, eventOptions, eventOrigin, eventMeta, listeners, payload }) {
  let res = payload;
  let listenersTally = listeners && listeners.length;

  // console.debug(`[vue-hooked-async-events] index-66: runCallbacks() - eventName: %o, \neventOrigin: %o, \n_listeners: %o\neventMeta: %o`, eventName, eventOrigin, listeners, eventMeta);

  if (listenersTally) {
    const { upListeners, closestListeners, downListeners, stop } = getBroadcastListenerRange({
      ...arguments[0],
      eventLevel: eventMeta.level
    });

    let i = 0, stopHere = false;
    let upListener, closestListener, downListener;
    do {
      upListener = upListeners && upListeners[i];
      closestListener = closestListeners && closestListeners[i];
      downListener = downListeners && downListeners[i];

      // console.debug(`[vue-hooked-async-events]-423: _runEventCallbacks() - upListener: %o, downListener: %o`, upListener, downListener);

      const upClosestDownListeners = [closestListener, upListener, downListener].filter(l => !isNil(l));
      // console.debug(`[vue-hooked-async-events]-426: _runEventCallbacks() - upClosestDownListeners: %o`, upClosestDownListeners);

      // run both up and down listeners (which ever is available)
      for (let listener of upClosestDownListeners) {
        if (stop || listener.listenerOptions.stopHere) stopHere = true;

        if (OPTIONS.debug.all && OPTIONS.debug.invokeListener || eventOptions.trace) {
          console.debug(`[vue-hooked-async-events]-380: Invoke Listener - eventName: %o, origin: %o, eventOrigin: %o, \npayload: %o, \nListener: %o\neventMeta: %o\nresponse: %o, \nstoppingHere: %o`, eventName, listener.listenerOrigin && listener.listenerOrigin.$options && listener.listenerOrigin.$options.name || '???', eventOrigin && eventOrigin.$options.name || '???', payload, listener, eventMeta, res, stopHere);
        }

        if (eventOptions.isAsync) {
          res = await runCallback({ payload: res, eventMeta, events, listener });
        } else {
          runCallback({ payload: res, eventMeta, events, listener });
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
 * @param payload
 * @param eventMeta
 * @param listener
 * @return {Promise<*>|undefined}
 */
function runCallback ({ payload, eventMeta, listener }) {
  // console.debug(`[vue-hooked-async-events] index-397: runCallbacks() - listener: %o`, listener.listenerOrigin._uid);

  // make sure we don't mutate the actual listenerOptions
  const listenerOptions = Object.assign({}, listener.listenerOptions);

  const { events, eventName } = eventMeta;

  if (listener.listenerOptions.once) {
    removeCallbacks({
      events,
      eventName,
      subscriberId: listener.subscriberId,
      callback:     listener.callback
    });
  }

  return listener.callback(payload, { ...eventMeta, listenerOptions, extra: listenerOptions.extra });
}


/**
 * linger a given event it it's lingerable
 * @param lingeringEvents
 * @param eventName
 * @param payload
 * @param eventOptions
 * @param eventMeta
 */
function lingerEvent ({ lingeringEvents, eventName, payload, eventOptions, eventMeta }) {
  if (lingeringEvents && (eventOptions.linger || OPTIONS.globalLinger)) {
    if (OPTIONS.debug.all && OPTIONS.debug.lingerEvent || eventOptions.trace) {
      console.debug(`[vue-hooked-async-events]-428: lingerEvent - eventName: %o \n%o`, eventName, eventMeta);
    }

    const id = genUniqID();

    let lingeringHook = undefined, lingeringPromise = undefined, lingeringResult = payload;
    if (eventOptions.isAsync) {
      if (eventOptions.linger >= Infinity || OPTIONS.globalLinger >= Infinity) {
        throw new Error(`[vue-hooked-async-events]-523: You cannot async and linger an event forever!`);
      }
      lingeringPromise = new Promise((resolve) => lingeringHook = resolve);
    }

    // stash the arguments for later use on new listeners
    (lingeringEvents[eventName] || (lingeringEvents[eventName] = [])).push({
      id,
      lingeringResult,
      lingeringHook, // to be resolved by run callbacks, see runLingeredEvents
      args: [payload, eventMeta]
    });

    // order the splice after linger ms later
    let timeout = eventOptions.linger || OPTIONS.globalLinger;
    if (timeout >= Infinity) timeout = 2147483647; // set to maximum allowed so that we don't have an immediate bailout
    setTimeout(() => {
      // finally resolve lingering event promise
      if (eventOptions.isAsync) {
        lingeringHook(lingeringResult); // finally settle lingering promise
      }

      const i = lingeringEvents[eventName].findIndex(le => le.id === id);
      lingeringEvents[eventName].splice(i, 1);

      if (OPTIONS.debug.all && OPTIONS.debug.lingerEvent || eventOptions.trace) {
        console.debug(`[vue-hooked-async-events]-584: remove lingerEvent - eventName: %o \n%o`, eventName, eventMeta);
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
 * @param lingeringEvents
 * @param eventName
 * @param listener
 */
async function runLingeredEvents ({ lingeringEvents, eventName, listener }) {
  // check if listener has an events lingering for it, if so then trigger these events on listener to handle
  if (lingeringEvents[eventName]) {
    for (let ei in lingeringEvents[eventName]) {
      // noinspection JSUnfilteredForInLoop
      const _event = lingeringEvents[eventName][ei];
      const [payload, eventMeta] = _event.args;
      const { eventOptions, eventOrigin } = eventMeta;

      // was linger ordered by the event or if listener catchUp is within range (linger was ordered by global linger)
      if (eventMeta.linger || listener.listenerOptions.catchUp <= (Date.now() - eventMeta.eventTimestamp)) {
        // noinspection JSIgnoredPromiseFromCall
        let result = await _runEventCallbacks({
          events:    [_event],
          payload,
          listeners: [listener],
          eventName,
          eventOptions,
          eventOrigin,
          eventMeta
        });

        if (eventOptions.isAsync) {
          // run event async resolution, see lingerEvent
          _event.lingeringResult = result; // store as the final result to be sent to event
          _event.args[0] = result; // update payload argument for next listener of lingering event
        }

        if (eventOptions.lingerForOne) {
          // noinspection JSUnfilteredForInLoop
          lingeringEvents[eventName].splice(ei, 1);
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
function getBroadcastListenerRange ({ eventName, eventOptions, eventOrigin, listeners, eventLevel }) {
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
  up = isNil(up) ? -1 : up;
  down = isNil(down) ? -1 : down;
  stop = isNil(stop) ? false : stop;

  let ranged = listenersInRange({ listeners, eventLevel, up, down, selfOnly, eventOrigin });

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
function listenersInRange ({ listeners, eventLevel, up, down, selfOnly, eventOrigin }) {
  // console.debug(`[vue-hooked-async-events]-603: listenersInRange() - arguments: %o`, arguments[0]);

  let closest, upListeners = [], closestListeners = [], downListeners = [];

  if (selfOnly) {
    closestListeners = [listeners.find(l => l.listenerOrigin._uid === eventOrigin._uid)].filter(l => !isNil(l));
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
 * @param events
 * @param eventName
 * @param subscriberId
 */
function removeListeners ({ events, eventName, subscriberId }) {
  if (!events[eventName]) return;

  for (let listenerIndex = 0; listenerIndex < events[eventName].length; listenerIndex++) {
    if (events[eventName][listenerIndex].subscriberId === subscriberId) {
      if (OPTIONS.debug.all && OPTIONS.debug.removeListener || events[eventName][listenerIndex].listenerOptions.trace) {
        const listener = events[eventName][listenerIndex];
        const { listenerOrigin } = listener;
        console.debug(`[vue-hooked-async-events]-694: ${OPTIONS.fallSilent || '$fallSilent(removeListener)'} eventName: %o origin: %o \nListener: %o`, eventName, listenerOrigin && listenerOrigin.$options && listenerOrigin.$options.name || '???', listener);
      }

      events[eventName].splice(listenerIndex, 1);
    }
  }
}


/**
 * remove event callbacks
 * @param events
 * @param eventName
 * @param subscriberId
 * @param callback
 */
function removeCallbacks ({ events, eventName, subscriberId, callback }) {
  if (!events[eventName]) return;

  let indexOfSubscriber = events[eventName].findIndex(function (el) {
    return el.subscriberId === subscriberId && el.callback === callback;
  });

  if (~indexOfSubscriber) {
    if (OPTIONS.debug.all && OPTIONS.debug.removeListener || events[eventName][indexOfSubscriber].listenerOptions.trace) {
      const listener = events[eventName][indexOfSubscriber];
      const { listenerOrigin } = listener;
      console.debug(`[vue-hooked-async-events]-721: ${OPTIONS.fallSilent || '$fallSilent(removeCallbacks)'} eventName: %o origin: %o \nListener: %o`, eventName, listenerOrigin && listenerOrigin.$options && listenerOrigin.$options.name || '???', listener);
    }
    events[eventName].splice(indexOfSubscriber, 1);
  }
}


/**
 * remove event and all its callbacks
 * @param events
 * @param eventName
 */
function removeGlobalEvent ({ events, eventName }) {
  for (let event in events) {
    if (event === eventName) {
      if (OPTIONS.debug.all && OPTIONS.debug.eraseEvent) {
        console.debug(`[vue-hooked-async-events]-737: ${OPTIONS.eraseEvent || '$eraseEvent(removeGlobalEvent)'} eventName: %o origin: %o \nListener: %o`, eventName, events[eventName]);
      }
      delete events[eventName];
    }
  }
}



/**
 * generate unique id to be used when tracking events and listeners
 * @return {string}
 */
function genUniqID () {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * assert if object is empty
 * @param obj
 * @return {boolean}
 */
function isEmpty (obj) {
  return Object.keys(obj).length === 0;
}

/**
 * assert if object is array
 * @param obj
 * @return {boolean}
 */
function isArray (obj) {
  return Array.isArray(obj);
}

/**
 * assert if variable is undefined or null
 * @param variable
 * @return {boolean}
 */
function isNil (variable) {
  return variable === undefined || variable === null;
}

/**
 * get closest value in array
 * @param array
 * @param num
 * @return {*}
 */
function closest (array, num) {
  let i = 0;
  let minDiff = 1000;
  let ans;
  for (i in array) {
    const m = Math.abs(num - array[i]);
    if (m < minDiff) {
      minDiff = m;
      ans = array[i];
    }
  }
  return ans;
}

const vueReservedProps = ['$options', '$parent', '$root', '$children', '$refs', '$vnode', '$slots', '$scopedSlots', '$createElement', '$attrs', '$listeners', '$el'];

/**
 * assert if prop type is not reserved
 * @param prop
 * @param options
 * @return {boolean|*}
 */
function isCorrectCustomName (prop, options) {
  if (vueReservedProps.includes(options[prop])) {
    console.warn('[vue-hooked-async-events]: ' + options[prop] + ' is used by Vue. Use another name');

    return false;
  }

  return options && typeof options[prop] === 'string' && options[prop];
}
