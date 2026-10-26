"""Deterministic original P1 caretaking through actual menu/button input only.

Inspired by the public GPL CareBot's menu timing primitives. This small audit
controller is independent of the Infipet renderer and never writes native RAM.
Diagnostic counters are logged only; decisions use visible state and an omission diary.
"""
from vm import NativeP1

class Caretaker:
    def __init__(self,pet:NativeP1,child_goal=(0,0),teen_goal=(0,0)):
        self.pet=pet;self.child_goal=child_goal;self.teen_goal=teen_goal
        self.observations=[];self.requests=[];self.last=None
        self.omitted_need_calls=0;self.omitted_discipline_calls=0
        self.pending_omission=None;self.need_repair=False
        self.previous_attention=False;self.attention_episode=0;self.consumed_episodes=set()
        self.false_candidate_since=None;self.last_precautionary_scold=-100000
        self.menu_failures=[]

    def observe(self):
        state=self.pet.state()
        key=tuple(state[k] for k in ['characterIndex','historyKind','careMistakes','missedDisciplineCalls','displayDiscipline','asleep','sick','sicknessCount'])+(bool(state['needCallTimer']),bool(state['disciplineCallTimer']))
        if key!=self.last:
            self.observations.append(state);self.last=key
        return state

    def selected(self):
        return next((i for i,v in enumerate(self.pet.frame()[512:519]) if v),None)

    def home(self):
        for _ in range(4):
            if self.selected() is None:break
            self.pet.press(2,pause=.8)
        frame=self.pet.frame()
        clock_m=tuple(''.join('#' if frame[y*32+x] else '.' for x in range(2,10)) for y in range(12,16))
        if clock_m==('........','.##.###.','.#.#.##.','.#.#.##.'):
            self.pet.press(1,pause=3)

    def select(self,index):
        for _ in range(3):
            self.home()
            for _ in range(10):
                if self.selected()==index:return True
                self.pet.press(0)
            self.pet.run(2)
        self.menu_failures.append({'wantedIcon':index,'state':self.pet.state()})
        return False

    def request(self,name,before):
        self.requests.append({'name':name,'before':before,'after':self.observe()})

    def food(self,snack=False):
        before=self.pet.state()
        if not self.select(0):return
        self.pet.press(1,pause=1)
        if self.pet.memory(0x75)!=int(snack):self.pet.press(0)
        self.pet.press(1,pause=7);self.home();self.request('snack' if snack else 'meal',before)

    def light(self,on):
        before=self.pet.state()
        if not self.select(1):return
        self.pet.press(1,pause=1)
        if self.pet.memory(0x75)!=int(not on):self.pet.press(0)
        self.pet.press(1,pause=2);self.home();self.request('lights-on' if on else 'lights-off',before)

    def simple(self,index,name,wait=7):
        before=self.pet.state()
        if not self.select(index):return
        self.pet.press(1,pause=wait);self.home();self.request(name,before)

    def tick(self,step=5):
        state=self.observe();stage=state['characterIndex']
        # Decision inputs below are display-equivalent state and a caretaker's
        # own clock/call log. Native care counters/history kinds are evidence
        # only and are not used to decide the next button.
        hungry=(state['hunger']+1)//4
        happy=(state['happiness']+1)//4
        attention=bool(self.pet.frame()[519])
        if attention and not self.previous_attention:self.attention_episode+=1
        self.previous_attention=attention
        if self.pending_omission and self.pet.seconds-self.pending_omission[1]>=15*60:
            if self.pending_omission[0]=='care':self.omitted_need_calls+=1;self.need_repair=True
            else:self.omitted_discipline_calls+=1
            self.pending_omission=None
        if stage==0:
            self.pet.run(step);return
        if state['asleep']:
            if state['lightsOn']:self.light(False)
            else:self.pet.run(step)
            return
        if not state['lightsOn']:self.light(True);return
        if state['waste']:self.simple(4,'clean',8);return
        if state['sick']:self.simple(3,'medicine',7);return
        goal=self.child_goal if stage==2 else self.teen_goal if stage in [3,4] else (0,0)
        if self.pending_omission and self.pending_omission[0]=='discipline':
            self.pet.run(step)
            return
        # The attention icon can briefly lag after feeding. Require a sustained
        # unnecessary visible call before interpreting it as misbehaviour.
        if attention and hungry>0 and happy>0:
            if self.false_candidate_since is None:self.false_candidate_since=self.pet.seconds
            if self.pet.seconds-self.false_candidate_since>=20:
                if self.omitted_discipline_calls<goal[1] and self.attention_episode not in self.consumed_episodes:
                    self.pending_omission=('discipline',self.pet.seconds)
                    self.consumed_episodes.add(self.attention_episode)
                else:self.simple(6,'discipline',6)
                return
        else:self.false_candidate_since=None
        if self.need_repair:
            if hungry==0:self.food(False);return
            self.need_repair=False
        # Finish planned unnecessary-call omissions with full hearts first.
        # Then omit hunger calls. An eight-minute precautionary scold schedule
        # while deliberately hungry catches ambiguous overlapping false calls
        # without reading their hidden timer or the upcoming game answer.
        want_care=self.omitted_discipline_calls>=goal[1] and self.omitted_need_calls<goal[0]
        if want_care:
            if attention and hungry==0 and self.attention_episode not in self.consumed_episodes:
                self.pending_omission=('care',self.pet.seconds)
                self.consumed_episodes.add(self.attention_episode)
            if self.pet.seconds-self.last_precautionary_scold>=8*60:
                self.last_precautionary_scold=self.pet.seconds
                self.simple(6,'precautionary-discipline',6);return
        if not want_care and hungry<3:
            self.food(False);return
        if happy<3:
            self.food(True);return
        self.pet.run(step)

    def until(self,predicate,maximum_seconds,step=5):
        end=self.pet.seconds+maximum_seconds
        while self.pet.seconds<end:
            state=self.observe()
            if predicate(state):return state
            if state['characterIndex']==0 and state['age']>0:
                raise RuntimeError(f'Native pet died: {state}')
            self.tick(step)
        raise TimeoutError(f'Native trace duration exceeded:{self.pet.state()}')

if __name__=='__main__':
    import json,time
    pet=NativeP1();pet.set_initial_clock();bot=Caretaker(pet)
    start=time.perf_counter();end=bot.until(lambda s:s['characterIndex']==2,8000)
    print(json.dumps({'child':end,'wallSeconds':time.perf_counter()-start,'actions':len(pet.actions),'requests':len(bot.requests)}),flush=True)
