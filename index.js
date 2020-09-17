'use strict';

const vueReservedProps = ['$options', '$parent', '$root', '$children', '$refs', '$vnode', '$slots', '$scopedSlots', '$createElement', '$attrs', '$listeners', '$el'];

function isEmpty (obj) {
  return Object.keys(obj).length === 0;
}

function isArray (obj) {
  return Array.isArray(obj);
}

function isCorrectCustomName (prop, options) {
  if (vueReservedProps.includes(options[prop])) {
    console.warn('[vue-handy-subscriptions]: ' + options[prop] + ' is used by Vue. Use another name');

    return false;
  }

  return options && typeof options[prop] === 'string' && options[prop];
}

function addListener (_ref) {
  let events = _ref.events,
      eventName = _ref.eventName,
      subscriberId = _ref.subscriberId,
      callback = _ref.callback,
      options = _ref.options;

  // todo check if listener has an event lingering for it, if so then trigger this listener's event
  (events[eventName] || (events[eventName] = [])).push({
    subscriberId,
    callback,
    options
  });

  if (options.expiry) setTimeout(removeListeners, options.expiry, _ref);
}

async function runCallbacks (_ref2) {
  let events = _ref2.events,
      eventName = _ref2.eventName,
      payload = _ref2.payload,
      eventOptions = _ref2.options,
      origin = _ref2.origin;

  let event = events && events[eventName];
  let cbTally = event && event.length;
  let meta = {
    eventOptions,
    callbackOptions: {},
    origin,
    listenersTally:  cbTally
  };
  let res = payload;

  if (cbTally) {
    let ev;
    if (eventOptions.reverse) ev = events[eventName].reverse(); else ev = events[eventName];

    if (eventOptions.stop) cbTally = 1;

    for (let listenerIndex = 0; listenerIndex < cbTally; listenerIndex++) {
      let entry = ev[listenerIndex];

      meta.callbackOptions = entry.options;

      if (eventOptions.isAsync) {
        res = await entry.callback(res, meta);
      } else {
        entry.callback(payload, meta);
      }

      if (entry.options.stop) break;
    }
  } //else {
    // return new Promise(resolve => resolve(...cbArgs));
  //}

  return res;
}

function removeListeners (_ref3) {
  let events = _ref3.events,
      event = _ref3.event,
      subscriberId = _ref3.subscriberId;

  for (let listenerIndex = 0; listenerIndex < events[event].length; listenerIndex++) {
    if (events[event][listenerIndex].subscriberId === subscriberId) {
      events[event].splice(listenerIndex, 1);
    }
  }
}

function removeCallbacks (_ref4) {
  let events = _ref4.events,
      event = _ref4.event,
      subscriberId = _ref4.subscriberId,
      callback = _ref4.callback;

  let indexOfSubscriber = events[event].findIndex(function (el) {
    return el.subscriberId === subscriberId && el.callback === callback;
  });

  if (~indexOfSubscriber) {
    events[event].splice(indexOfSubscriber, 1);
  }
}

function removeGlobalEvent (_ref5) {
  let events = _ref5.events,
      eventName = _ref5.eventName;

  for (let event in events) {
    if (event === eventName) {
      delete events[eventName];
    }
  }
}

export default {
  install: function install (Vue, options = {}) {
    let idSubsProp = isCorrectCustomName('idSubs', options) || '$idSubs';
    let listenToProp = isCorrectCustomName('listenTo', options) || '$listenTo';
    let emitEventProp = isCorrectCustomName('emitEvent', options) || '$emitEvent';
    let eraseEventProp = isCorrectCustomName('eraseEvent', options) || '$eraseEvent';
    let fallSilentProp = isCorrectCustomName('fallSilent', options) || '$fallSilent';

    Vue.mixin({
      beforeCreate:  function beforeCreate () {
        this._uniqID = Math.random().toString(36).substr(2, 9);
        this.shouldFallSilent = true;
      },
      beforeDestroy: function beforeDestroy () {
        if (this.shouldFallSilent) this.$fallSilent();
      }
    });

    Vue.prototype[idSubsProp] = { _events: {} };
    let events = Vue.prototype[idSubsProp]._events;

    /* subscribe to event */
    Vue.prototype[listenToProp] = function (eventName, cb, options = { stop: false, expiry: 0 }) {
      let ID = this._uniqID;

      if (isArray(eventName) && isArray(cb)) {
        for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
          for (let callbackIndex = 0, _len = cb.length; callbackIndex < _len; callbackIndex++) {
            addListener({
              events,
              eventName:    eventName[eventNameIndex],
              subscriberId: ID,
              callback:     cb[callbackIndex],
              options
            });
          }
        }

        return;
      }

      if (isArray(eventName)) {
        for (let _eventNameIndex = 0, _len2 = eventName.length; _eventNameIndex < _len2; _eventNameIndex++) {
          addListener({
            events:       events,
            eventName:    eventName[_eventNameIndex],
            subscriberId: ID,
            callback:     cb,
            options
          });
        }

        return;
      }

      if (isArray(cb)) {
        for (let _callbackIndex = 0, _len3 = cb.length; _callbackIndex < _len3; _callbackIndex++) {
          addListener({
            events:       events,
            eventName:    eventName,
            subscriberId: ID,
            callback:     cb[_callbackIndex],
            options
          });
        }
      } else {
        addListener({ events: events, eventName: eventName, subscriberId: ID, callback: cb, options });
      }
    };

    /* fire event */
    Vue.prototype[emitEventProp] = function (eventName, payload, options = {
      reverse: false,
      stop:    false,
      linger:  0,
      isAsync:  false
    }) {
      console.debug(`index.js-170: () - this: %o`, this);
      return runCallbacks({ events, eventName, payload, origin: this, options });
    };

    /* remove event from events object */
    Vue.prototype[eraseEventProp] = function (eventName) {
      if (!isEmpty(events)) {
        if (isArray(eventName)) {
          for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
            removeGlobalEvent({ events: events, eventName: eventName[eventIndex] });
          }
        } else {
          removeGlobalEvent({ events: events, eventName: eventName });
        }
      }
    };

    /* unsubscribe from subscriptions */
    Vue.prototype[fallSilentProp] = function (event, cb) {
      let ID = this._uniqID;

      if (!isEmpty(events)) {
        if (event && event in events && typeof event === 'string' && !cb) {
          removeListeners({ events: events, event: event, subscriberId: ID });

          return;
        }

        if (event && isArray(event) && !cb) {
          for (let eventIndex = 0, len = event.length; eventIndex < len; eventIndex++) {
            removeListeners({ events: events, event: event[eventIndex], subscriberId: ID });
          }

          return;
        }

        if (event && cb && isArray(cb) && event in events && events[event].length) {
          for (let callbackIndex = 0, _len4 = cb.length; callbackIndex < _len4; callbackIndex++) {
            removeCallbacks({ events: events, event: event, subscriberId: ID, callback: cb[callbackIndex] });
          }

          return;
        }

        if (event && cb && event in events && events[event].length) {
          removeCallbacks({ events: events, event: event, subscriberId: ID, callback: cb });

          return;
        }

        if (event && cb && typeof cb !== 'function') {
          return;
        }

        for (let _event in events) {
          removeListeners({ events: events, event: _event, subscriberId: ID });
        }
      }
    };
  }
};
