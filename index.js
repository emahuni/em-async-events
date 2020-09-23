'use strict';

let Options;

export default {
  /**
   * install plugin
   * @param Vue
   * @param options
   */
  install: function install (Vue, options = {
    callbacksOptions: { stopHere: false, expire: 0, once: false },
    eventsOptions:    { linger: 0, isAsync: false, levelRange: 'first-parent' }
  }) {
    let asyncEventsProp = isCorrectCustomName('asyncEvents', options) || '$asyncEvents';
    let onEventProp = isCorrectCustomName('onEvent', options) || '$onEvent';
    let onceEventProp = isCorrectCustomName('onceEvent', options) || '$onceEvent';
    let emitEventProp = isCorrectCustomName('emitEvent', options) || '$emitEvent';
    let eraseEventProp = isCorrectCustomName('eraseEvent', options) || '$eraseEvent';
    let fallSilentProp = isCorrectCustomName('fallSilent', options) || '$fallSilent';
    let chainCallbackPayloadProp = isCorrectCustomName('chainCallbackPayload', options) || '$chainCallbackPayload';
    let defaultCallbackOptions = options.callbacksOptions;
    let defaultEventOptions = options.eventsOptions;

    if (isNil(options.debug)) {
      options.debug = Vue.config.devtools;
    }

    Options = options;

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
      // console.debug('[vue-hooked-async-events]-124: () - context of this: ', this);
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

  if (Options.debug) {
    console.debug(`[vue-hooked-async-events]-321: addListener() eventName: %o \n%o`, eventName, listener);
  }

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

  // console.debug(`[vue-hooked-async-events] index-66: runCallbacks() - eventName: %o, \neventOrigin: %o, \n_listeners: %o\neventMeta: %o`, eventName, eventOrigin, listeners, eventMeta);

  if (listenersTally) {
    const { upListeners, closestListeners, downListeners, stop } = getBroadcastListenerLevelRange({
      ...arguments[0],
      eventLevel: eventMeta.level
    });

    let i = 0, stopHere = false;
    let upListener, closestListener, downListener;
    do {
      upListener = upListeners[i];
      closestListener = closestListeners[i];
      downListener = downListeners[i];

      // console.debug(`[vue-hooked-async-events]-423: _runEventCallbacks() - upListener: %o, downListener: %o`, upListener, downListener);

      const upClosestDownListeners = [closestListener, upListener, downListener].filter(l => !isNil(l));
      // console.debug(`[vue-hooked-async-events]-426: _runEventCallbacks() - upClosestDownListeners: %o`, upClosestDownListeners);

      // run both up and down listeners (which ever is available)
      for (let listener of upClosestDownListeners) {

        if (eventOptions.isAsync) {
          res = await runCallback({ payload: res, eventMeta, listener });
        } else {
          runCallback({ payload: res, eventMeta, listener });
        }

        if (stop || listener.options.stopHere) {
          stopHere = true;
          break;
        }

        if (Options.debug) {
          console.debug(`[vue-hooked-async-events]-444: _runEventCallbacks() - listener: %o, \npayload: %o, \neventMeta: %o\nresponse: %o, \nstoppingHere: %o`, listener, payload, eventMeta, res, stopHere);
        }
      }

      if (stopHere) break;

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
  // console.debug(`[vue-hooked-async-events]-603: listenersInRange() - arguments: %o`, arguments);

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

    // rangeLs = upListeners.concat(closestListeners.concat(downListeners));

    return { upListeners, closestListeners, downListeners };
  }
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
