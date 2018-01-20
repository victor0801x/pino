'use strict'

var split = require('split2')
var Parse = require('fast-json-parse')
var chalk = require('chalk')

var levels = {
  default: 'USERLVL',
  60: 'FATAL',
  50: 'ERROR',
  40: 'WARN',
  30: 'INFO',
  20: 'DEBUG',
  10: 'TRACE'
}

var standardKeys = [
  'pid',
  'hostname',
  'name',
  'level',
  'time',
  'v'
]

function toTimezoneOffset (aMinTimeoffset) {
  // +/- minute timeoffset
  var tz = aMinTimeoffset || new Date().getTimezoneOffset()
  var tmp = Math.abs(tz)

  // var offset = String(Math.floor(tmp / 60)).padStart(2, '0') + ':' + String(tmp % 60).padStart(2, '0')
  var offset = _lpadzero(String(Math.floor(tmp / 60)), 2) + ':' + _lpadzero(String(tmp % 60), 2)
  return tz > 0 ? '-' + offset : '+' + offset
}

function _lpadzero (aTarget, aLength, aPadChar) {
  var char = aPadChar || '0'
  var targetStr = aTarget.toString()
  var times = aLength - targetStr.length
  var padding = ''
  while ((times--) > 0) {
    padding += char
  }
  return padding + targetStr
}

function withSpaces (value, eol) {
  var lines = value.split(/\r?\n/)
  for (var i = 1; i < lines.length; i++) {
    lines[i] = '    ' + lines[i]
  }
  return lines.join(eol)
}

function filter (value, messageKey, eol) {
  var keys = Object.keys(value)
  var filteredKeys = standardKeys.concat([messageKey])
  var result = ''

  for (var i = 0; i < keys.length; i++) {
    if (filteredKeys.indexOf(keys[i]) < 0) {
      result += '    ' + keys[i] + ': ' + withSpaces(JSON.stringify(value[keys[i]], null, 2), eol) + eol
    }
  }

  return result
}

function isPinoLine (line) {
  return line && (line.hasOwnProperty('v') && line.v === 1)
}

function pretty (opts) {
  var timeTransOnly = opts && opts.timeTransOnly
  var formatter = opts && opts.formatter
  var dateFormat = opts && opts.dateFormat
  var levelFirst = opts && opts.levelFirst
  var messageKey = opts && opts.messageKey
  var forceColor = opts && opts.forceColor
  var eol = opts && opts.crlf ? '\r\n' : '\n'
  messageKey = messageKey || 'msg'

  var stream = split(mapLine)
  var ctx
  var levelColors

  var pipe = stream.pipe

  stream.pipe = function (dest, opts) {
    ctx = new chalk.constructor({
      enabled: !!((chalk.supportsColor && dest.isTTY) || forceColor)
    })

    if (forceColor && ctx.level === 0) {
      ctx.level = 1
    }

    levelColors = {
      default: ctx.white,
      60: ctx.bgRed,
      50: ctx.red,
      40: ctx.yellow,
      30: ctx.green,
      20: ctx.blue,
      10: ctx.grey
    }

    return pipe.call(stream, dest, opts)
  }

  return stream

  function mapLine (line) {
    var parsed = new Parse(line)
    var value = parsed.value

    if (parsed.err || !isPinoLine(value)) {
      // pass through
      return line + eol
    }

    if (timeTransOnly) {
      value.time = asISODate(value.time, dateFormat)
      return JSON.stringify(value) + eol
    }

    line = (levelFirst)
        ? asColoredLevel(value) + ' ' + formatTime(value)
        : formatTime(value) + ' ' + asColoredLevel(value)

    if (formatter) {
      return opts.formatter(value, {
        prefix: line,
        chalk: ctx,
        withSpaces: withSpaces,
        filter: filter,
        formatTime: formatTime,
        asColoredText: asColoredText,
        asColoredLevel: asColoredLevel
      }) + eol
    }

    if (value.name || value.pid || value.hostname) {
      line += ' ('

      if (value.name) {
        line += value.name
      }

      if (value.name && value.pid) {
        line += '/' + value.pid
      } else if (value.pid) {
        line += value.pid
      }

      if (value.hostname) {
        line += ' on ' + value.hostname
      }

      line += ')'
    }

    line += ': '

    if (value[messageKey]) {
      line += ctx.cyan(value[messageKey])
    }

    line += eol

    if (value.type === 'Error') {
      line += '    ' + withSpaces(value.stack, eol) + eol
    } else {
      line += filter(value, messageKey, eol)
    }

    return line
  }

  function asISODate (aTime, aFmt, aTZO) {
    var time = aTime
    var format = aFmt || 'YYYY-MM-DDThh:mm:ss.SSSTZ'

    var date = new Date(time)
    // make independent of the system timezone
    var tzOffset = aTZO || date.getTimezoneOffset()
    date.setUTCMinutes(date.getUTCMinutes() - tzOffset)
    var year = format.indexOf('YYYY') > -1
      ? date.getUTCFullYear()
      : date.getUTCFullYear().toString().substring(2, 4)
    var month = _lpadzero(date.getUTCMonth() + 1, 2)
    var day = _lpadzero(date.getUTCDate(), 2)
    var hour = _lpadzero(date.getUTCHours(), 2)
    var minute = _lpadzero(date.getUTCMinutes(), 2)
    var second = _lpadzero(date.getUTCSeconds(), 2)
    var milli = _lpadzero(date.getUTCMilliseconds(), 3)
    date.setUTCMinutes(date.getUTCMinutes() + tzOffset)

    var _format = format
      .replace(/Y{1,4}/g, year)
      .replace(/MM/g, month)
      .replace(/DD/g, day)
      .replace(/hh/g, hour)
      .replace(/mm/g, minute)
      .replace(/ss/g, second)
      .replace(/SSS/g, milli)
      .replace(/TZ/g, toTimezoneOffset(tzOffset))
    return _format
  }

  function formatTime (value) {
    try {
      if (!value || !value.time) {
        return ''
      } else {
        return '[' + asISODate(value.time, dateFormat) + ']'
      }
    } catch (_) {
      return ''
    }
  }

  function asColoredLevel (value) {
    return asColoredText(value, levelColors.hasOwnProperty(value.level) ? levels[value.level] : levels.default)
  }

  function asColoredText (value, text) {
    if (levelColors.hasOwnProperty(value.level)) {
      return levelColors[value.level](text)
    } else {
      return levelColors.default(text)
    }
  }
}

module.exports = pretty
