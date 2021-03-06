import EventEmitter from '../helpers/event-emitter';
import WebReaderError from '../webreader-error';

/**
 * Stores the private data of a Recognizer instance
 *
 * @type {WeakMap}
 */
let dataMap = new WeakMap();

/**
 * @typedef SpeechRecognitionHash
 * @type {Object}
 * @property {Object[]} [grammars=[]] The collection of <code>SpeechGrammar</code> objects
 * which represent the grammars that are active for this recognition
 * @property {string} [lang=''] The language of the recognition for the request.
 * If unspecified it defaults to the language of the html document root element
 * @property {boolean} [continuous=false] Controls whether the interaction is stopped when the user
 * stops speaking or not
 * @property {boolean} [interimResults=false] Controls whether interim results are returned or not
 * @property {number} [maxAlternatives=1] The maximum number of <code>SpeechRecognitionAlternative</code>s per result
 * @property {string} [serviceURI=''] The location of the speech recognition service to use
 *
 * @see https://dvcs.w3.org/hg/speech-api/raw-file/tip/webspeechapi.html#speechreco-attributes
 */

/**
 * Retrieves the object that allows to recognize the speech or
 * <code>null</code> if the feature is not supported
 *
 * @returns {SpeechRecognition|null}
 */
function getRecognizer() {
   return window.SpeechRecognition ||
          window.webkitSpeechRecognition ||
          null;
}

/**
 * Binds one or more events to a <code>SpeechRecognition</code> object
 *
 * @param {SpeechRecognition} recognizer A <code>SpeechRecognition</code> object
 * @param {Object} eventsHash An object of name-function pairs,
 * where name is the event to listen and function is the function to attach
 */
function bindEvents(recognizer, eventsHash) {
   for(let eventName in eventsHash) {
      recognizer.addEventListener(eventName, eventsHash[eventName]);
   }
}

/**
 * Unbinds one or more events to a <code>SpeechRecognition</code> object
 *
 * @param {SpeechRecognition} recognizer A <code>SpeechRecognition</code> object
 * @param {Object} eventsHash An object of name-function pairs,
 * where name is the event to listen and function is the function to attach
 */
function unbindEvents(recognizer, eventsHash) {
   for(let eventName in eventsHash) {
      recognizer.removeEventListener(eventName, eventsHash[eventName]);
   }
}

/**
 * The class exposing the reading features of a web page
 *
 * @class
 */
export
 default class Recognizer {
   /**
    * Creates a Recognizer instance
    *
    * @constructor
    *
    * @param {SpeechRecognitionHash} [options={}] The options to customize the settings of the recognizer
    */
   constructor(options={}) {
      let Recognizer = getRecognizer();

      if (!Recognizer) {
         throw Error('API not supported');
      }

      /**
       * The speech recognizer used
       *
       * @type {SpeechRecognition}
       */
      let recognizer = new Recognizer();

      for(let key in options) {
         if (options.hasOwnProperty(key) && recognizer[key] !== undefined) {
            recognizer[key] = options[key];
         }
      }

      dataMap.set(this, {
         recognizer: recognizer,
         isRecognizing: false
      });
   }

   /**
    * Detects if the recognition feature is supported
    *
    * @returns {boolean}
    */
   static isSupported() {
      return !!getRecognizer();
   }

   /**
    * Determines if the recognizer is recognizing a speech
    *
    * @return {boolean}
    */
   isRecognizing() {
      return dataMap
         .get(this)
         .isRecognizing;
   }

   /**
    * Starts the recognition of the speech
    *
    * @returns {Promise}
    */
   recognize() {
      return new Promise((resolve, reject) => {
         let data = dataMap.get(this);
         let eventsHash = {
            audiostart: () => {
               data.isRecognizing = true;
               EventEmitter.fireEvent(`${EventEmitter.namespace}.recognitionstart`, document);
            },
            result: event => {
               for(let i = event.resultIndex; i < event.results.length; i++) {
                  if (event.results[i].isFinal) {
                     let bestGuess = event.results[i][0];

                     console.debug('Recognition completed');
                     console.debug(`Recognized "${bestGuess.transcript}" with a confidence of ${bestGuess.confidence}`);

                     EventEmitter.fireEvent(`${EventEmitter.namespace}.recognitionresult`, document, {
                        data: {
                           result: bestGuess
                        }
                     });

                     data.isRecognizing = false;
                     resolve(bestGuess.transcript);
                  }
               }
            },
            error: event => {
               console.debug('Recognition error:', event.error);

               data.isRecognizing = false;
               EventEmitter.fireEvent(`${EventEmitter.namespace}.recognitionerror`, document, {
                  error: event.error
               });

               reject(new WebReaderError('An error has occurred while recognizing your speech'));
            },
            noMatch: () => {
               console.debug('Recognition ended because of nomatch');

               data.isRecognizing = false;
               EventEmitter.fireEvent(`${EventEmitter.namespace}.recognitionnomatch`, document);

               reject(new WebReaderError('Sorry, I could not find a match'));
            },
            end: () => {
               console.debug('Recognition ended');

               data.isRecognizing = false;
               unbindEvents(data.recognizer, eventsHash);

               EventEmitter.fireEvent(`${EventEmitter.namespace}.recognitionend`, document);

               // If the Promise isn't resolved or rejected at this point
               // the demo is running on Chrome and Windows 8.1 (issue #428873).
               reject(new WebReaderError('Sorry, I could not recognize your speech'));
            }
         };

         bindEvents(data.recognizer, eventsHash);

         console.debug('Recognition started');
         data.recognizer.start();
      });
   }

   /**
    * Stops listening and recognizing the speech of the user
    */
   abort() {
      dataMap
         .get(this)
         .recognizer
         .abort();
   }
}