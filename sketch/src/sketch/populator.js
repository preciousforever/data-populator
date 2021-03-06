/**
 * Populator
 *
 * Provides functionality to populate layers.
 */

import sketch from 'sketch'
import log from '@data-populator/core/log'
import * as Core from '@data-populator/core'
import Context from './context'
import * as Utils from './utils'
import * as Data from './data'
import * as Layers from './layers'
import * as Actions from './actions'
import * as SwapSymbolAction from './actions/swapSymbol'

/**
 * Populate types:
 */
export const POPULATE_TYPE = {
  PRESET: 'preset',
  JSON: 'json',
  URL: 'url'
}

/**
 * Populates an array of layers using the provided data array.
 *
 * @param {Array} layers
 * @param {Array} data
 * @param {Object} opt
 *
 * opt: {
 *   rootDir: {String},
 *   randomizeData: {Boolean},
 *   trimText: {Boolean},
 *   insertEllipsis: {Boolean},
 *   defaultSubstitute: {String}
 * }
 */
export function populateLayers(layers, data, opt) {
  // track used data rows
  let usedRows = []

  // process each layer
  for (let i = 0; i < layers.length; i++) {
    let layer = layers[i]

    let dataRow = Core.populator.selectDataRow(data, usedRows, opt.randomizeData)

    // populate layer
    populateLayer(layer, dataRow.dataRow, {
      rootDir: opt.rootDir,
      trimText: opt.trimText,
      insertEllipsis: opt.insertEllipsis,
      defaultSubstitute: opt.defaultSubstitute
    })
  }
}

/**
 * Populates a layers using the provided data.
 *
 * @param {MSLayer} layer
 * @param {Object} data
 * @param {Object} opt
 *
 * opt: {
 *   rootDir: {String},
 *   trimText: {Boolean},
 *   insertEllipsis: {Boolean},
 *   defaultSubstitute: {String}
 * }
 */
export function populateLayer(layer, data, opt) {
  // populate group layer
  // artboards are also layer groups
  if (Layers.isLayerGroup(layer)) {
    // populate artboard names
    let artboardLayers = Layers.findLayersInLayer('*', false, Layers.ARTBOARD, layer, false, null)
    artboardLayers.forEach(artboardLayer => {
      populateArtboard(artboardLayer, data, {
        defaultSubstitute: opt.defaultSubstitute
      })
      Actions.performActions(artboardLayer, data)
    })

    // populate text layers
    let textLayers = Layers.findLayersInLayer('*', false, Layers.TEXT, layer, false, null)
    textLayers.forEach(textLayer => {
      populateTextLayer(textLayer, data, {
        trimText: opt.trimText,
        insertEllipsis: opt.insertEllipsis,
        defaultSubstitute: opt.defaultSubstitute
      })
      Actions.performActions(textLayer, data)
    })

    // populate images
    let imageLayers = Layers.findLayersInLayer('*', false, Layers.SHAPE, layer, false, null)
    imageLayers = imageLayers.concat(
      Layers.findLayersInLayer('*', false, Layers.BITMAP, layer, false, null)
    )
    imageLayers.forEach(imageLayer => {
      populateImageLayer(imageLayer, data, {
        rootDir: opt.rootDir
      })
      Actions.performActions(imageLayer, data)
    })

    // populate symbols
    let symbolLayers = Layers.findLayersInLayer('*', false, Layers.SYMBOL, layer, false, null)
    symbolLayers.forEach(function (symbolLayer) {
      populateSymbolLayer(symbolLayer, data, opt)
      Actions.performActions(symbolLayer, data)
    })

    // perform actions on group
    Actions.performActions(layer, data)

    // perform actions on sub-groups
    let groupLayers = Layers.findLayersInLayer('*', false, Layers.GROUP, layer, false, null)
    groupLayers.forEach(function (groupLayer) {
      Actions.performActions(groupLayer, data)
    })
  }

  // populate text layer
  else if (Layers.isLayerText(layer)) {
    populateTextLayer(layer, data, {
      trimText: opt.trimText,
      insertEllipsis: opt.insertEllipsis,
      defaultSubstitute: opt.defaultSubstitute
    })
    Actions.performActions(layer, data)
  }

  // populate image layer
  else if (Layers.isLayerShapeGroup(layer) || Layers.isLayerBitmap(layer)) {
    // populate image placeholder
    if (layer.name().indexOf('{') > -1) {
      populateImageLayer(layer, data, {
        rootDir: opt.rootDir
      })
      Actions.performActions(layer, data)
    }
  }

  // populate symbol
  else if (Layers.isSymbolInstance(layer)) {
    populateSymbolLayer(layer, data, opt)
    Actions.performActions(layer, data)
  }
}

/**
 * Restores the original layer content and clears the metadata.
 *
 * @param {MSLayer} layer
 */
export function clearLayer(layer) {
  // clear group layer
  if (Layers.isLayerGroup(layer)) {
    // clear artboard names
    let artboardLayers = Layers.findLayersInLayer('*', false, Layers.ARTBOARD, layer, false, null)
    artboardLayers.forEach(artboardLayer => {
      clearArtboard(artboardLayer)
    })

    // clear text layers
    let textLayers = Layers.findLayersInLayer('*', false, Layers.TEXT, layer, false, null)
    textLayers.forEach(textLayer => {
      clearTextLayer(textLayer)
    })

    // clear images
    let imageLayers = Layers.findLayersInLayer('{*}*', false, Layers.SHAPE, layer, false, null)
    imageLayers = imageLayers.concat(
      Layers.findLayersInLayer('{*}*', false, Layers.BITMAP, layer, false, null)
    )
    imageLayers.forEach(imageLayer => {
      clearImageLayer(imageLayer)
    })

    // clear symbols
    let symbolLayers = Layers.findLayersInLayer('*', false, Layers.SYMBOL, layer, false, null)
    symbolLayers.forEach(function (symbolLayer) {
      clearSymbolLayer(symbolLayer)
    })
  }

  // clear text layer
  else if (Layers.isLayerText(layer)) {
    clearTextLayer(layer)
  }

  // clear image layer
  else if (Layers.isLayerShapeGroup(layer) || Layers.isLayerBitmap(layer)) {
    // populate image placeholder
    if (layer.name().indexOf('{') > -1) {
      clearImageLayer(layer)
    }
  }

  // clear symbol
  else if (Layers.isSymbolInstance(layer)) {
    clearSymbolLayer(layer)
  }
}

/**
 * Removes any Data Populator data from a layer's metadata.
 *
 * @param {MSLayer} layer
 */
function removeLayerMetadata(layer) {
  // get user info
  let userInfo = NSMutableDictionary.dictionaryWithDictionary(layer.userInfo())

  // prepare clean user info
  let cleanUserInfo = NSMutableDictionary.alloc().init()

  // get keys
  let keys = Utils.convertToJSArray(userInfo.allKeys())

  // add values other than data populator's
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    if (key.indexOf('datapopulator') === -1) {
      cleanUserInfo.setValue_forKey(userInfo.valueForKey(key), key)
    }
  }

  // set clean user info
  layer.setUserInfo(cleanUserInfo)
}

/**
 * Retrieves the symbol swap action if present.
 *
 * @param {MSSymbolInstance} layer
 * @param {Object} data
 * @returns {Object}
 */
function getSymbolSwapAction(layer, data) {
  return Actions.extractActions(String(layer.name()))
    .filter(swapAction => {
      return (
        swapAction.command === SwapSymbolAction.name ||
        swapAction.command === SwapSymbolAction.alias
      )
    })
    .map(swapAction => {
      return Actions.resolveAction(swapAction, data)
    })
    .filter(swapAction => {
      return swapAction.condition
    })[0]
}

/**
 * Populates a symbol instance layer.
 *
 * @param {MSSymbolInstance} layer
 * @param {Object} data
 * @param {Object} opt
 * @param {Boolean} nested
 *
 * opt: {
 *   rootDir: {String},
 *   trimText: {Boolean},
 *   insertEllipsis: {Boolean},
 *   defaultSubstitute: {String}
 * }
 */
function populateSymbolLayer(layer, data, opt, nested) {
  // get swap action on top level symbol
  if (!nested) {
    let swapAction = getSymbolSwapAction(layer, data)
    if (swapAction) {
      let symbolName = swapAction.params[0]
      let symbolToSwapWith = Layers.findSymbolMasterWithName(symbolName)
      if (symbolToSwapWith) {
        // convert to JS wrapped object and swap symbol master
        sketch.fromNative(layer).master = symbolToSwapWith
      }
    }
  }

  let overrides = null
  let symbolMaster = null

  // get overrides and symbol master
  // layer might be a symbol master if populating target symbol override
  if (Layers.isSymbolMaster(layer)) {
    overrides = NSMutableDictionary.alloc().init()
    symbolMaster = layer
  } else {
    // get overrides
    overrides = NSMutableDictionary.dictionaryWithDictionary(
      Layers.getSymbolOverrides(layer) || NSDictionary.alloc().init()
    )

    // get master for symbol instance
    symbolMaster = layer.symbolMaster()
  }

  // set root overrides in option to pass down in recursive calls
  if (!nested) {
    opt.rootOverrides = overrides
  }
  opt.rootOverrides = opt.rootOverrides || NSMutableDictionary.alloc().init()

  // populate text layers
  let textLayers = Layers.findLayersInLayer('*', false, Layers.TEXT, symbolMaster, false, null)
  textLayers.forEach(textLayer => {
    populateTextLayer(textLayer, data, {
      trimText: opt.trimText,
      insertEllipsis: opt.insertEllipsis,
      defaultSubstitute: opt.defaultSubstitute,
      overrides: overrides,
      rootOverrides: opt.rootOverrides
    })
  })

  // populate images
  let imageLayers = Layers.findLayersInLayer('{*}', false, Layers.SHAPE, symbolMaster, false, null)
  imageLayers = imageLayers.concat(
    Layers.findLayersInLayer('{*}', false, Layers.BITMAP, symbolMaster, false, null)
  )
  imageLayers.forEach(imageLayer => {
    populateImageLayer(imageLayer, data, {
      rootDir: opt.rootDir,
      overrides: overrides
    })
  })

  // populate symbols
  let symbolLayers = Layers.findLayersInLayer('*', false, Layers.SYMBOL, symbolMaster, false, null)
  symbolLayers.forEach(symbolLayer => {
    // get swap action on symbol and the symbol to swap with
    let swapAction = getSymbolSwapAction(symbolLayer, data)
    let symbolToSwapWith = null
    if (swapAction) {
      let symbolName = swapAction.params[0]
      symbolToSwapWith =
        symbolName === undefined ? 'None' : Layers.findSymbolMasterWithName(symbolName)
    }

    // swap nested symbol
    // swap action always takes priority
    if (symbolToSwapWith) {
      // get symbol id
      let idOfSymbolToSwapWith = symbolToSwapWith === 'None' ? '' : symbolToSwapWith.symbolID()

      // prepare nested root overrides
      let nestedRootOverrides = opt.rootOverrides.valueForKey(symbolLayer.objectID())
      if (!nestedRootOverrides) {
        nestedRootOverrides = NSMutableDictionary.alloc().init()
      }
      let nestedOpt = Object.assign({}, opt)
      nestedOpt.rootOverrides = nestedRootOverrides

      // get nested overrides
      let nestedOverrides =
        symbolToSwapWith !== 'None'
          ? populateSymbolLayer(symbolToSwapWith, data, nestedOpt, true)
          : nestedRootOverrides

      nestedOverrides.setValue_forKey(idOfSymbolToSwapWith, 'symbolID')
      overrides.setValue_forKey(nestedOverrides, symbolLayer.objectID())
    } else {
      // resolve nested symbol override
      if (
        opt.rootOverrides.valueForKey(symbolLayer.objectID()) &&
        opt.rootOverrides.valueForKey(symbolLayer.objectID()).valueForKey('symbolID')
      ) {
        // get overridden symbol ID
        let symbolID = String(
          opt.rootOverrides.valueForKey(symbolLayer.objectID()).valueForKey('symbolID')
        )

        // hide symbol
        if (!symbolID || !symbolID.length) {
          // get existing nested overrides
          let existingNestedOverrides = overrides.valueForKey(symbolLayer.objectID())
          if (!existingNestedOverrides) {
            existingNestedOverrides = NSDictionary.alloc().init()
          }
          let nestedOverrides = NSMutableDictionary.dictionaryWithDictionary(
            existingNestedOverrides
          )

          // set empty symbol override
          // no need to keep populating recursively
          nestedOverrides.setValue_forKey('', 'symbolID')
          overrides.setValue_forKey(nestedOverrides, symbolLayer.objectID())
        } else {
          let overriddenSymbolLayer = Layers.findSymbolMasterWithId(symbolID)

          // prepare nested root overrides
          let nestedRootOverrides = opt.rootOverrides.valueForKey(symbolLayer.objectID())
          if (!nestedRootOverrides) {
            nestedRootOverrides = NSMutableDictionary.alloc().init()
          }
          let nestedOpt = Object.assign({}, opt)
          nestedOpt.rootOverrides = nestedRootOverrides

          // get nested overrides
          let nestedOverrides = populateSymbolLayer(overriddenSymbolLayer, data, nestedOpt, true)
          nestedOverrides.setValue_forKey(symbolID, 'symbolID')

          // keep overrides if not overwritten
          Object.keys(nestedRootOverrides).forEach(key => {
            if (!nestedOverrides.objectForKey(key)) {
              nestedOverrides.setObject_forKey(nestedRootOverrides.objectForKey(key), key)
            }
          })

          overrides.setValue_forKey(nestedOverrides, symbolLayer.objectID())
        }
      }

      // nested symbol is not overridden
      else {
        // prepare nested root overrides
        let nestedRootOverrides = opt.rootOverrides.valueForKey(symbolLayer.objectID())
        if (!nestedRootOverrides) {
          nestedRootOverrides = NSMutableDictionary.alloc().init()
        }
        let nestedOpt = Object.assign({}, opt)
        nestedOpt.rootOverrides = nestedRootOverrides

        // get nested overrides
        let nestedOverrides = populateSymbolLayer(symbolLayer, data, nestedOpt, true)

        // keep overrides if not overwritten
        Object.keys(nestedRootOverrides).forEach(key => {
          if (!nestedOverrides.objectForKey(key)) {
            nestedOverrides.setObject_forKey(nestedRootOverrides.objectForKey(key), key)
          }
        })

        overrides.setValue_forKey(nestedOverrides, symbolLayer.objectID())
      }
    }
  })

  // set new overrides
  if (!nested) Layers.setSymbolOverrides(layer, overrides)

  // return overrides
  return overrides
}

/**
 * Clears the symbol layer.
 *
 * @param {MSSymbolInstance} layer
 */
function clearSymbolLayer(layer) {
  // get existing overrides
  let existingOverrides = Layers.getSymbolOverrides(layer)
  if (!existingOverrides) return

  // clear overrides except for symbol overrides
  let clearedOverrides = clearOverrides(existingOverrides)

  // remove metadata
  removeLayerMetadata(layer)

  // set cleared overrides
  Layers.setSymbolOverrides(layer, clearedOverrides)
}

/**
 * Removes all 'content' data from overrides, keeping only symbol overrides.
 *
 * @param {NSDictionary} overrides
 * @returns {NSDictionary}
 */
function clearOverrides(overrides) {
  // create mutable overrides
  overrides = NSMutableDictionary.dictionaryWithDictionary(overrides)

  // filter dictionary
  let keys = overrides.allKeys()
  keys.forEach(key => {
    let value = overrides.objectForKey(key)
    if (value.isKindOfClass(NSDictionary.class())) {
      value = clearOverrides(value)
      if (value.allKeys().count() > 0) {
        overrides.setValue_forKey(value, key)
      } else {
        overrides.removeObjectForKey(key)
      }
    } else {
      if (key !== 'symbolID' && String(key).indexOf('-original') === -1) {
        overrides.removeObjectForKey(key)
      }
    }
  })

  // restore original overrides
  keys = overrides.allKeys()
  keys.forEach(key => {
    if (String(key).indexOf('-original') > -1) {
      let value = overrides.objectForKey(key)
      overrides.removeObjectForKey(key)
      overrides.setValue_forKey(value, String(key).replace('-original', ''))
    }
  })

  return overrides
}

/**
 * Populates a text layer.
 *
 * @param {MSTextLayer} layer
 * @param {Object} data
 * @param {Object} opt
 *
 * opt: {
 *   trimText: {Boolean},
 *   insertEllipsis: {Boolean},
 *   defaultSubstitute: {String}
 *   overrides: {NSMutableDictionary}
 * }
 */
function populateTextLayer(layer, data, opt) {
  // check if layer is in symbol
  let inSymbol = !!opt.overrides

  // get original text
  let originalText = getOriginalText(layer, inSymbol)

  // set original text
  // set even if inside symbol so that if taken out of symbol, it can be repopulated
  setOriginalText(layer, originalText)

  // extract placeholders from layer name
  let namePlaceholders = Core.placeholders.extractPlaceholders(layer.name())

  // extract args
  let args = Core.args.extractArgs(layer.name(), [
    {
      name: 'lines',
      alias: 'l',
      type: Number
    }
  ])

  // populate with placeholder in layer name
  let populatedString = originalText
  if (namePlaceholders.length) {
    // populate first placeholder
    populatedString = Core.placeholders.populatePlaceholder(
      namePlaceholders[0],
      data,
      opt.defaultSubstitute
    )
  }

  // populate based on content of text layer
  else {
    // extract placeholders from original text
    let placeholders = Core.placeholders.extractPlaceholders(originalText)
    if (placeholders.length) {
      // create populated string, starting with the original text and gradually replacing placeholders
      populatedString = originalText
      placeholders.forEach(placeholder => {
        // populate placeholder found in the original text
        let populatedPlaceholder = Core.placeholders.populatePlaceholder(
          placeholder,
          data,
          opt.defaultSubstitute
        )

        // replace original placeholder string (e.g. {firstName}) with populated placeholder string
        populatedString = populatedString.replace(placeholder.string, populatedPlaceholder)
      })
    }

    // populate placeholders in override
    else if (inSymbol) {
      let layerId = String(layer.objectID())

      // extract placeholders from original override or the current override if no original
      let override = opt.overrides.valueForKey(layerId)
      let rootOverride = opt.rootOverrides.valueForKey(layerId)
      let hasRootOverride = !!rootOverride
      let originalOverride = (hasRootOverride ? opt.rootOverrides : opt.overrides).valueForKey(
        layerId + '-original'
      )

      originalText = originalOverride || (hasRootOverride ? rootOverride : override)
      let placeholders = Core.placeholders.extractPlaceholders(originalText)

      // create populated string, starting with the original text and gradually replacing placeholders
      populatedString = originalText
      placeholders.forEach(placeholder => {
        // populate placeholder found in the original text
        let populatedPlaceholder = Core.placeholders.populatePlaceholder(
          placeholder,
          data,
          opt.defaultSubstitute
        )

        // replace original placeholder string (e.g. {firstName}) with populated placeholder string
        populatedString = populatedString.replace(placeholder.string, populatedPlaceholder)
      })

      // set original override
      let targetOverrides = hasRootOverride ? opt.rootOverrides : opt.overrides
      targetOverrides.setValue_forKey(originalText, layerId + '-original')
    }
  }

  // check if the populated string is different from original text
  // this prevents needlessly setting text and affecting text layers that don't contain placeholders
  if (populatedString === originalText) return

  // trim text, taking into account the lines arg if available
  if (layer.textBehaviour() !== 0 && opt.trimText) {
    populatedString = getTrimmedText(layer, populatedString, opt.insertEllipsis, args.lines)
  }

  // set populated string as an override for text layer within a symbol
  if (inSymbol) {
    // make text invisible by setting it to a space
    if (!populatedString.length) {
      populatedString = ' '
    }

    // get id of text layer
    let layerId = layer.objectID()

    // add override for layer
    opt.overrides.setValue_forKey(populatedString, layerId)
  }

  // set populated string for normal text layer
  else {
    // hide text layer if populated string is empty
    if (!populatedString.length) {
      populatedString = '-'
      layer.setIsVisible(false)
    } else {
      layer.setIsVisible(true)
    }

    // get current font
    let font = layer.font()

    // set text layer text
    layer.setStringValue(populatedString)

    // set current font back
    layer.setFont(font)

    // resize text layer to fit text
    Layers.refreshTextLayer(layer)
  }
}

/**
 * Clears the text layer.
 *
 * @param {MSTextLayer} layer
 */
function clearTextLayer(layer) {
  // get original text
  let originalText = getOriginalText(layer)

  // check if there is original text stored for the layer
  if (originalText) {
    // set original text
    layer.setStringValue(originalText)

    // refresh and resize
    Layers.refreshTextLayer(layer)
  }

  // clear any data populator metadata
  removeLayerMetadata(layer)
}

/**
 * Gets the original text with placeholders for the layer.
 *
 * @param {MSTextLayer/MSArtboardGroup} layer
 * @returns {String}
 */
function getOriginalText(layer, ignoreMetadata) {
  // get data dictionary
  let dataDict = getDataDictionary(layer)

  // get text stored in layer metadata
  // LEGACY: check old 'textWithPlaceholders' key
  let text = dataDict.valueForKey('textWithPlaceholders')
  if (!text) text = dataDict.valueForKey('originalText')

  // set original text if it doesn't exist
  if (ignoreMetadata || !text || !text.length) {
    // get text from text layer
    if (Layers.isLayerText(layer)) {
      text = String(layer.stringValue())
    }

    // get name of artboard
    else if (Layers.isArtboard(layer)) {
      text = String(layer.name())
    }
  }

  return text
}

/**
 * Sets the original text as metadata on the layer.
 *
 * @param {MSLayer} layer
 * @param {String} text
 */
function setOriginalText(layer, text) {
  // get data dictionary
  let dataDict = getDataDictionary(layer)

  // save new text as the original text in metadata
  dataDict.setValue_forKey(text, 'originalText')

  // LEGACY: remove any old values stored in the dictionary
  dataDict.removeObjectForKey('textWithPlaceholders')

  // set new data dictionary
  setDataDictionary(layer, dataDict)
}

/**
 * Retrieves the data dictionary from layer's userInfo.
 *
 * @param {MSLayer} layer
 * @returns {NSMutableDictionary}
 */
function getDataDictionary(layer) {
  // get user info
  let userInfo = NSMutableDictionary.dictionaryWithDictionary(layer.userInfo())

  // get plugin data dictionary
  let dataDict = userInfo.valueForKey('com.precious-forever.sketch.datapopulator')

  // LEGACY: get values for old versions of data populator
  if (!dataDict) dataDict = userInfo.valueForKey('com.precious-forever.sketch.datapopulator2')
  if (!dataDict) dataDict = userInfo.valueForKey('com.precious-forever.sketch.datapopulatorBETA')

  // get mutable dictionary from dictionary
  dataDict = NSMutableDictionary.dictionaryWithDictionary(dataDict)

  return dataDict
}

/**
 * Sets a new data dictionary in userInfo of the layer.
 *
 * @param {MSLayer} layer
 * @param {NSMutableDictionary} dataDict
 */
function setDataDictionary(layer, dataDict) {
  // get user info
  let userInfo = NSMutableDictionary.dictionaryWithDictionary(layer.userInfo())

  // LEGACY: filter out any data from old data populator versions
  let newUserInfo = NSMutableDictionary.alloc().init()
  let keys = Utils.convertToJSArray(userInfo.allKeys())
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    if (key.indexOf('datapopulator') === -1) {
      newUserInfo.setValue_forKey(userInfo.valueForKey(key), key)
    }
  }
  userInfo = newUserInfo

  // set data dictionary
  userInfo.setValue_forKey(dataDict, 'com.precious-forever.sketch.datapopulator')

  // set new user info
  layer.setUserInfo(userInfo)
}

/**
 * Trims the text to fit in the specified number of lines in the text layer.
 *
 * @param {MSTextLayer} layer
 * @param {String} text
 * @param {Boolean} insertEllipsis
 * @param {int} lines
 * @returns {String}
 */
function getTrimmedText(layer, text, insertEllipsis, lines) {
  // trim to one line by default
  if (!lines || lines < 1) lines = 1

  // create a copy of the layer to prevent changing the actual layer
  layer = Utils.copyLayer(layer)

  // Force to auto-height behaviour if fixed size to allow check for height
  layer.setTextBehaviour_mayAdjustFrame(1, true)

  // set text to a single character to get height of one line
  layer.setStringValue('-')

  // resize text layer to fit text
  Layers.refreshTextLayer(layer)

  // get original text layer height
  let lineHeight = layer.frame().height()

  // set actual text
  layer.setStringValue(text)

  // resize to fit and get new height
  Layers.refreshTextLayer(layer)
  let actualHeight = layer.frame().height()

  // shorten text to fit
  while (actualHeight > lineHeight * lines) {
    // trim last character
    if (insertEllipsis) {
      text = text.substring(0, text.length - 2) + '…'
    } else {
      text = text.substring(0, text.length - 1)
    }

    // set trimmed text and re-evaluate height
    layer.setStringValue(text)
    Layers.refreshTextLayer(layer)
    actualHeight = layer.frame().height()
  }

  return text
}

/**
 * Populates an image layer.
 *
 * @param {MSShapeGroup/MSBitmapLayer} layer
 * @param {Object} data
 * @param {Object} opt
 *
 * opt: {
 *   rootDir: {String},
 *   overrides: {NSMutableDictionary}
 * }
 */
function populateImageLayer(layer, data, opt) {
  // check if layer is in symbol
  let inSymbol = !!opt.overrides

  // extract image placeholder from layer name
  let imagePlaceholder = Core.placeholders.extractPlaceholders(layer.name())[0]
  if (!imagePlaceholder) return

  // get url by populating the placeholder
  let imageUrl = Core.placeholders.populatePlaceholder(imagePlaceholder, data, '')

  // get image data
  let imageData
  if (imageUrl) {
    imageData = getImageData(imageUrl, opt.rootDir)
    if (!imageData) {
      return Context().document.showMessage(
        'Some images could not be loaded. Please check the URLs.'
      )
    }
  }

  // get layer fill
  let fill = layer.style().fills().firstObject()
  if (!fill) {
    // create new fill
    fill = layer.style().addStylePartOfType(0)
  }

  // set fill properties
  fill.setFillType(4)
  fill.setPatternFillType(1)

  // set image as an override for image layer within a symbol
  if (inSymbol) {
    // get id of image layer
    let layerId = layer.objectID()

    // add override for layer
    if (imageData) {
      opt.overrides.setValue_forKey(imageData, layerId)
    } else {
      opt.overrides.setValue_forKey(getImagePlaceholder(layer), layerId)
    }
  }

  // set image for normal image layer
  else {
    // enable fill
    fill.setIsEnabled(true)

    // set image as fill
    if (imageData) {
      fill.setImage(imageData)
    } else {
      // set default placeholder
      fill.setImage(getImagePlaceholder(layer))
    }
  }
}

/**
 * Clears the image layer.
 *
 * @param {MSShapeGroup/MSBitmapLayer} layer
 */
function clearImageLayer(layer) {
  // get layer fill
  let fill = layer.style().fills().firstObject()
  if (!fill) {
    fill = layer.style().addStylePartOfType(0)
  }
  fill.setFillType(4)
  fill.setPatternFillType(1)

  // set placeholder
  let imageData = getImagePlaceholder(layer)
  fill.setImage(imageData)

  // remove metadata
  removeLayerMetadata(layer)
}

/**
 * Creates image data representing the default image placeholder.
 *
 * @param {MSLayer} layer
 * @return {MSImageData}
 */
function getImagePlaceholder(layer) {
  // get resources path
  let scriptPath = Context().scriptPath
  let rootDir = scriptPath
    .stringByAppendingPathComponent('/../../Resources/images/')
    .stringByStandardizingPath()

  // select placeholder size
  let placeholderImageFile = 'imagePlaceholder_'
  let maxDimension = Math.max(layer.frame().width(), layer.frame().height())
  if (maxDimension <= 220) {
    placeholderImageFile += 'small'
  } else if (maxDimension <= 416) {
    placeholderImageFile += 'medium'
  } else {
    placeholderImageFile += 'large'
  }

  return getImageData(`${placeholderImageFile}.png`, rootDir)
}

/**
 * Gets image data from image url. Image can be remote or local.
 *
 * @param {String} imageUrl
 * @param {String} rootDir
 * @returns {MSImageData}
 */
function getImageData(imageUrl, rootDir) {
  // check if url is local or remote
  let image
  if (/(http)[s]?:\/\//g.test(imageUrl)) {
    // download image from url
    image = Data.getImageFromRemoteURL(imageUrl)
  } else {
    // remove first slash
    if (imageUrl[0] === '/') imageUrl = imageUrl.substring(1)

    // build full image url by adding the root dir
    imageUrl = NSString.stringWithString(rootDir).stringByAppendingPathComponent(imageUrl)

    // load image from filesystem
    image = Data.getImageFromLocalURL(imageUrl)
  }

  // create image data from NSImage
  return Data.getImageData(image)
}

/**
 * Populates an artboard name.
 *
 * @param {MSArtboard} layer
 * @param {Object} data
 * @param {Object} opt
 *
 * opt: {
 *   defaultSubstitute {String}
 * }
 */
function populateArtboard(layer, data, opt) {
  // get original text
  let originalText = getOriginalText(layer)

  // set original text
  setOriginalText(layer, originalText)

  // extract placeholders from original artboard name
  let placeholders = Core.placeholders.extractPlaceholders(originalText)

  // create populated string, starting with the original text and gradually replacing placeholders
  let populatedString = originalText
  placeholders.forEach(placeholder => {
    // populate placeholder found in the original text
    let populatedPlaceholder = Core.placeholders.populatePlaceholder(
      placeholder,
      data,
      opt.defaultSubstitute
    )

    // replace original placeholder string (e.g. {firstName}) with populated placeholder string
    populatedString = populatedString.replace(placeholder.string, populatedPlaceholder)
  })

  // set artboard name
  layer.setName(populatedString)
}

/**
 * Clears the artboard layer.
 *
 * @param {MSArtboardGroup} layer
 */
function clearArtboard(layer) {
  // get original text
  let originalText = getOriginalText(layer)

  // check if there is original text stored for the layer
  if (originalText) {
    // set artboard name
    layer.setName(originalText)
  }

  // clear any data populator metadata
  removeLayerMetadata(layer)
}
