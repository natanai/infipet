from PIL import Image

tama = open("tama.b", "rb")

# Given the starting address, seek to it in the ROM (we'll convert from the 'logical addresses' on Ghidra
# to the 'physical ones' to seek to, because I will never remember to multiply by 2),
# then read out the constants from each successive LBPX instruction. Stop when a RETD instruction is reached.
def ripFrom(addr, stopAddr=None):
  tama.seek(addr*2)
  consts = []
  inst = int(tama.read(2).hex(), base=16)
  while (stopAddr is not None and addr <= stopAddr) or (inst & 0xf00) == 0x900:
    consts.append(inst & 0xff)
    inst = int(tama.read(2).hex(), base=16)
    addr += 1
  if stopAddr is None:
    # This should now be a RETD instruction. If it's not. COMPLAIN
    if not (inst & 0xf00) == 0x100:
      print("Ended on something other than a RETD! Abort! Abort!")
      return []
    consts.append(inst & 0xff)
  return (consts,addr)

def makeImage(columns):
  img = Image.new( 'RGB', (16,8), "white") # Create a new white image... inside a square
  pixels = img.load() # Create the pixel map
  for i in range(len(columns)):
    col = columns[i]
    for j in range(8):
      # LSB is COM0, MSB is COM7
      pixelSet = (col >> j) & 0x1
      color = 255 if pixelSet else 0
      pixels[i,j] = (color, color, 100)
  return img

# So my theory is that each LBPX/RETD chain is a sprite... each byte read out is a single column
# on the LCD (i.e. X constant, Y 0-7 or 8-15). So I should able to rip the chain's data... print it to
# a pixel bitmap.... and then see something resembling an image from the Tama. So let's try it.
def printFrom(addr, stopAddr=None):
  (columns,foo) = ripFrom(addr,stopAddr)
  img = makeImage(columns)
  img.show()

def ripRange(start,end):
  addr = start
  while addr < end:
    (columns,addr) = ripFrom(addr)
    img = makeImage(columns)
    img.save("tama_{}.png".format(hex(addr)))
    # ripFrom returns the RETD address we ended on, so increment by 1.
    addr += 1

characters = ["Babytchi", "Marutchi", "Tamatchi", "Kuchitamatchi", "Mametchi/Bill", "Ginjirotchi",
              "Maskutchi", "Kuchipatchi", "Nyorotchi", "Tarakotchi"]
# Whoops I got it backwards. Oh well. Flip it and reverse it.
characters.reverse()

def getDiscipline(x):
  if x == 0:
    return "0%"
  elif x == 4:
    return "25%"
  elif x == 8:
    return "50%"
  elif x == 12:
    return "75%"
  elif x == 15:
    return "100%"
  else:
    return "??%"

def getNumberShots(x):
  sickValue = 0xf
  ret = 0
  while (sickValue & 0x8) > 0:
    sickValue |= 0x8
    sickValue = (sickValue + x) & 0xf
    ret += 1
  return ret

stats = {
          "Wake Time": { "length": 2, "transform": lambda x: "{}:00".format(x) },
          "Sleep Time": { "length": 2, "transform": lambda x: "{}:00".format(x) },
          "Base Hungry Heart Loss Rate": { "length": 2, "transform": lambda x: "{} minutes".format(x) },
          "Base Happy Heart Loss Rate": { "length": 2, "transform": lambda x: "{} minutes".format(x) }, 
          "Base Time to Sickness": { "length": 3, "transform": lambda x: "{} minutes".format(x) },
          "Shots to Get Well": { "length": 1, "transform": lambda x: getNumberShots(x) },
          "Min Weight": { "length": 2, "transform": lambda x: hex(x)[2:] },
          "Max Weight": { "length": 2, "transform": lambda x: hex(x)[2:] },
          "Base Time to Evolution": { "length": 3, "transform": lambda x: "{} minutes".format(x) },
          "Countdown to Discipline":
            { "length": 1, "transform": lambda x: "{} hungry/happy heart decrements".format(x) },
          "Initial Discipline": { "length": 1, "transform": lambda x: getDiscipline(x) },
          "Game Win Probability": { "length": 1, "transform": lambda x: "{}%".format((16-x)/16*100) },
          "Game Input Delay (on win)": { "length": 1, "transform": lambda x: "{} iterations".format(x) },
          "Game Input Delay (on loss)": { "length": 1, "transform": lambda x: "{} iterations".format(x) },
          "Bites to Eat Food": { "length": 1, "transform": lambda x: 2 if x == 1 else 4 },
        }

def padZero(x):
  return "0" * (2-len(x)) + x

def reverse(x):
  return x[1] + x[0]

def getValue(x):
  vals = []
  for c in x:
    vals.insert(0,c)
  return int(''.join(vals), base=16)

def decodeStats(data):
  ret = {}
  index = 0
  # The data is just easier to deal with this way ok...
  data = ''.join([reverse(padZero(hex(x).replace("0x",""))) for x in data])
  for x in stats: 
    dataLength = stats[x]["length"]
    dataTransform = stats[x]["transform"]
    ret[x] = dataTransform(getValue(data[index:index+dataLength]))
    index += dataLength
  return ret

def ripTamaStats():
  addr = 0x1564
  endAddr = 0x15e5
  ret = {}
  while addr < endAddr:
    (data, addr) = ripFrom(addr)
    character = characters.pop()
    ret[character] = decodeStats(data)
    # ripFrom returns the RETD address we ended on, so increment by 1.
    addr += 1
  return ret

def writeTamaStats():
  dest = open("stats.txt", "w", encoding="utf8")
  stats = ripTamaStats()
  for tama in stats:
    dest.write("{}:\n".format(tama))
    tamaStats = stats[tama]
    for stat in tamaStats:
      dest.write("  {}: {}\n".format(stat, tamaStats[stat]))
    dest.write("\n")
  dest.close() 
  
