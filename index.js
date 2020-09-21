'use strict';

export default {
  /**
   * install plugin
   * @param Vue
   * @param options
   */
  install: function install (Vue, options = {}) {
    let asyncEventsProp = isCorrectCustomName('asyncEvents', options) || '$asyncEvents';
    let onEventProp = isCorrectCustomName('onEvent', options) || '$onEvent';
    let onceEventProp = isCorrectCustomName('onceEvent', options) || '$onceEvent';
    let emitEventProp = isCorrectCustomName('emitEvent', options) || '$emitEvent';
    let eraseEventProp = isCorrectCustomName('eraseEvent', options) || '$eraseEvent';
    let fallSilentProp = isCorrectCustomName('fallSilent', options) || '$fallSilent';
    let chainCallbackPayloadProp = isCorrectCustomName('chainCallbackPayload', options) || '$chainCallbackPayload';
    let defaultCallbackOptions = options.callbacksOptions || { stop: false, expire: 0, once: false };
    let defaultEventOptions = options.eventsOptions || { stop: false, linger: 0, isAsync: false };

    /**
     * mix into vue
     */
    Vue.mixin({
      data () {
        return {
          shouldFallSilent: true
        };
      },
      beforeCreate: function beforeCreate () {
        this._uniqID = genUniqID();
      },

      beforeDestroy: function beforeDestroy () {
        if (this.shouldFallSilent) this.$fallSilent();
      }
    });

    /**
     * plugin local state
     * @type {{_events: {}}}
     */
    Vue.prototype[asyncEventsProp] = { _events: {}, _lingeringEvents: {} };
    let events = Vue.prototype[asyncEventsProp]._events;
    let lingeringEvents = Vue.prototype[asyncEventsProp]._lingeringEvents;

    /**
     * add event listener
     * @param eventName
     * @param callback
     * @param options
     */
    Vue.prototype[onEventProp] = function (eventName, callback, options = defaultCallbackOptions) {
      const args = {
        events,
        lingeringEvents,
        subscriberId:   this._uniqID,
        listenerOrigin: this,
        options
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
            eventName: eventName[_eventNameIndex],
            callback
          });
        }

        return;
      }

      if (isArray(callback)) {
        for (let _callbackIndex = 0, _len3 = callback.length; _callbackIndex < _len3; _callbackIndex++) {
          addListener({
            ...args,
            eventName,
            callback: callback[_callbackIndex]
          });
        }
      } else {
        addListener({
          ...args,
          eventName,
          callback
        });
      }
    };


    /**
     * add event listener that only listens for event once and removed once executed
     * @param eventName
     * @param callback
     * @param options
     */
    Vue.prototype[onceEventProp] = function (eventName, callback, options = defaultCallbackOptions) {
      options.once = true;
      Vue.prototype[onEventProp](eventName, callback, options);
    };

    /**
     * emit event and run callbacks subscribed to the event
     * @param eventName
     * @param payload
     * @param options
     * @return {Promise<*>}
     */
    Vue.prototype[emitEventProp] = function (eventName, payload, options = defaultEventOptions) {
      return runEventCallbacks({
        events,
        lingeringEvents,
        eventName,
        payload,
        eventOrigin:  this,
        eventOptions: options
      });
    };

    /**
     * chain listeners results
     * @param payload
     * @param newPayload
     * @return {Promise<*>}
     */
    Vue.prototype[chainCallbackPayloadProp] = function (payload, newPayload) {
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
     * @param event
     * @param callback
     */
    Vue.prototype[fallSilentProp] = function (event, callback) {
      const subscriberId = this._uniqID;

      if (!isEmpty(events)) {
        if (event && event in events && typeof event === 'string' && !callback) {
          removeListeners({ events, event, subscriberId });

          return;
        }

        if (event && isArray(event) && !callback) {
          for (let eventIndex = 0, len = event.length; eventIndex < len; eventIndex++) {
            removeListeners({ events, event: event[eventIndex], subscriberId });
          }

          return;
        }

        if (event && callback && isArray(callback) && event in events && events[event].length) {
          for (let callbackIndex = 0, _len4 = callback.length; callbackIndex < _len4; callbackIndex++) {
            removeCallbacks({ events, event, subscriberId, callback: callback[callbackIndex] });
          }

          return;
        }

        if (event && callback && event in events && events[event].length) {
          removeCallbacks({ events, event, subscriberId, callback });

          return;
        }

        if (event && callback && typeof callback !== 'function') {
          return;
        }

        for (let _event in events) {
          removeListeners({ events, event: _event, subscriberId });
        }
      }
    };
  }
};


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


/**
 * Add event listener
 * @param events
 * @param lingeringEvents
 * @param eventName
 * @param subscriberId
 * @param callback
 * @param options
 * @param listenerOrigin
 */
function addListener ({ events, lingeringEvents, eventName, subscriberId, callback, options, listenerOrigin }) {
  const level = getOriginLevel(listenerOrigin);
  const listener = {
    eventName,
    subscriberId,
    listenerOrigin,
    callback,
    options,
    level
  };

  // check if listener has an events lingering for it, if so then trigger these events on listener to handle
  if (lingeringEvents[eventName]) {
    for (let _event of lingeringEvents[eventName]) {
      const [payload, eventMeta] = _event.args;
      eventMeta.callbackOptions = options;
      const { eventOptions, eventOrigin } = eventMeta;

      // noinspection JSIgnoredPromiseFromCall
      _runEventCallbacks({
        events:    [_event],
        payload,
        listeners: [listener],
        eventName,
        eventOptions,
        eventOrigin,
        eventMeta
      });
    }
  }

  (events[eventName] || (events[eventName] = [])).push(listener);

  if (options.expire) setTimeout(removeListeners, options.expire, ...arguments);
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
 * get the closest listener's index to the event level given
 * @param listeners
 * @param eventLevel
 * @return {*}
 */
function closestListenerIndex (listeners, eventLevel) {
  if (!Array.isArray(listeners) || !listeners.length) return;
  // get the closest listener's level to eventLevel
  let lv = closest(listeners.map(l => l.level), eventLevel);
  // return the index of the listener in listeners array
  return listeners.findIndex(l => l.level === lv);
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
    eventName,
    // make sure we don't mutate the actual options
    eventOptions:    Object.assign({}, eventOptions),
    eventOrigin,
    level,
    callbackOptions: {},
    listenersTally
  };

  lingerEvent({ ...arguments[0], eventMeta });

  return _runEventCallbacks({ events, listeners, eventName, payload, eventOptions, eventOrigin, eventMeta });
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

  if (listenersTally) {
    const { cli, upTo, downTo, stop, selfOnly } = getBroadcastListenerLevelRange({
      ...arguments[0],
      eventLevel: eventMeta.level
    });

    // console.debug(`[vue-hooked-async-events] index-66: runCallbacks() - eventName: %o, \neventOrigin: %o, \n_listeners: %o`, eventName, eventOrigin, listeners);
    // for (let listenerIndex = 0; listenerIndex < listenersTally; listenerIndex++) {
    let upi = cli, downi = cli, stopNow = false;
    do {
      let upListener;
      if (!isNil(upTo)) upListener = listeners[upi];

      let downListener;
      if (!isNil(downTo) && (upi !== downi || isNil(upTo))) downListener = listeners[downi];

      // console.debug(`[index]-423: _runEventCallbacks() - upListener: %o, downListener: %o`, upListener, downListener);

      const upDownListeners = [upListener, downListener].filter(l => !isNil(l));
      // console.debug(`[index]-426: _runEventCallbacks() - upDownListeners: %o`, upDownListeners);
      // run both up and down listeners (which ever is available)
      for (let listener of upDownListeners) {
        // console.debug(`[index]-425: _runEventCallbacks() - listener: %o`, listener);
        if (eventOptions.isAsync) {
          res = await runCallback({ payload: res, eventMeta, listener });
        } else {
          runCallback({ payload: res, eventMeta, listener });
        }

        if (eventOptions.stop || stop || listener.options.stop) {
          stopNow = true;
          break;
        }
      }

      if (stopNow) break;

      // todo cater for linger and expire changes from listener
    } while (!selfOnly && upi-- >= upTo && downi++ <= downTo);
  }

  return res;
}


/**
 * run given callback
 * @param payload
 * @param eventMeta
 * @param listener
 * @param eventOptions
 * @return {Promise<*>|undefined}
 */
function runCallback ({ payload, eventMeta, listener }) {
  // console.debug(`[vue-hooked-async-events] index-397: runCallbacks() - listener: %o`, listener.listenerOrigin._uid);

  // make sure we don't mutate the actual options
  eventMeta.callbackOptions = Object.assign({}, listener.options);

  return listener.callback(payload, eventMeta);
}


/**
 * find the closest listener where the event was fired
 * @param selfOnly
 * @param listeners
 * @param up
 * @param down
 * @param eventLevel
 * @param eventOrigin
 * @return {{upTo: *, closestListenerIndex: (*), downTo: *}}
 */
function closestListenerInfo ({ selfOnly, listeners, up, down, eventLevel, eventOrigin }) {
  const lTally = listeners.length;
  const lTally_1 = lTally > 0 ? lTally - 1 : lTally;

  /**
   * closest listener index
   * @type {*}
   */
  let cli = selfOnly ? listeners.findIndex(l => l.listenerOrigin._uid === eventOrigin._uid) : closestListenerIndex(listeners, eventLevel);
  // make sure cli is valid
  if (isNil(cli) || cli < 0) cli = lTally_1;

  // we are not going to have undefined for both upTo and downTo coz both up and down are never -1 at the same time
  let upTo = up < 0 ? undefined : up === Infinity ? 0 : cli >= lTally_1 ? lTally_1 : cli - up;
  let downTo = down < 0 ? undefined : down === Infinity ? lTally_1 : cli >= lTally_1 ? lTally_1 : cli + down;

  // make sure values are valid
  if (upTo < 0) upTo = 0;
  if (downTo > lTally_1) downTo = lTally_1;

  return { cli, upTo, downTo };
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
  if (eventOptions.linger && lingeringEvents) {
    const id = genUniqID();
    // stash the arguments for later use on new listeners
    (lingeringEvents[eventName] || (lingeringEvents[eventName] = [])).push({
      id,
      args: [payload, eventMeta]
    });
    // order the splice after linger ms later
    setTimeout(() => {
      const i = lingeringEvents[eventName].findIndex(le => le.id === id);
      lingeringEvents[eventName].splice(i, 1);
    }, eventOptions.linger);
  }
}

/**
 * get event broadcast components level range
 * @param eventName
 * @param eventOptions
 * @param eventOrigin
 * @param listeners
 * @param eventLevel
 * @return {{stop: *, selfOnly: *, cli: *, upTo: *, downTo: *}}
 */
function getBroadcastListenerLevelRange ({ eventName, eventOptions, eventOrigin, listeners, eventLevel }) {
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

  const lr = eventOptions.levelRange;

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
          case'descendents':
          case'descendants':
            down = Infinity;
            break;


          case'parent':
          case'parents':
            up = 1;
            break;
          case'ancestor':
          case'ancestors':
            up = Infinity;
            break;


          case'sibling':
          case'siblings':
            up = 0;
            down = 0;
            break;
          case'kin':
          case'kins':
          case'family':
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
            throw new Error(`[vue-hooked-async-events] ERROR-562: unknown token: ${token} for levelRange: ${lr} for event: ${eventName}`);
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


  // get info about closest listener to event
  const closestInfo = closestListenerInfo({
    selfOnly,
    up,
    down,
    listeners,
    eventLevel,
    eventOrigin
  });

  return { stop, selfOnly, ...closestInfo };
}

/**
 * remove all event listeners
 * @param events
 * @param event
 * @param subscriberId
 */
function removeListeners ({ events, event, subscriberId }) {
  for (let listenerIndex = 0; listenerIndex < events[event].length; listenerIndex++) {
    if (events[event][listenerIndex].subscriberId === subscriberId) {
      events[event].splice(listenerIndex, 1);
    }
  }
}


/**
 * remove event callbacks
 * @param events
 * @param event
 * @param subscriberId
 * @param callback
 */
function removeCallbacks ({ events, event, subscriberId, callback }) {
  let indexOfSubscriber = events[event].findIndex(function (el) {
    return el.subscriberId === subscriberId && el.callback === callback;
  });

  if (~indexOfSubscriber) {
    events[event].splice(indexOfSubscriber, 1);
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
      delete events[eventName];
    }
  }
}
