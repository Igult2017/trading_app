import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  BookOpen, 
  Target, 
  TrendingUp, 
  Brain, 
  Plus, 
  Save, 
  Image as ImageIcon,
  BarChart3,
  Activity,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface TrainingExample {
  id: string;
  title: string;
  category: string;
  symbol: string;
  timeframe: string;
  outcome: 'hit_target' | 'stopped_out' | 'breakeven' | 'pending';
  profitLoss: number;
  imagePath?: string;
  createdAt: Date;
  isValidated: boolean;
}

interface PatternCategory {
  id: string;
  name: string;
  type: 'smc' | 'patterns' | 'confluence';
  description: string;
  count: number;
}

export default function PatternTraining() {
  const [selectedTab, setSelectedTab] = useState('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Mock data - TODO: Replace with real API calls
  const patternCategories: PatternCategory[] = [
    {
      id: '1',
      name: 'Order Blocks',
      type: 'smc',
      description: 'Institutional order accumulation zones',
      count: 24
    },
    {
      id: '2', 
      name: 'Fair Value Gaps',
      type: 'smc',
      description: 'Imbalances in price action',
      count: 18
    },
    {
      id: '3',
      name: 'Break of Structure',
      type: 'smc', 
      description: 'Market structure shift patterns',
      count: 31
    },
    {
      id: '4',
      name: 'Support & Resistance',
      type: 'patterns',
      description: 'Key horizontal levels',
      count: 45
    },
    {
      id: '5',
      name: 'Head & Shoulders',
      type: 'patterns',
      description: 'Reversal pattern formations',
      count: 12
    },
    {
      id: '6',
      name: 'Multi-Timeframe Confluence',
      type: 'confluence',
      description: 'Cross-timeframe alignment setups',
      count: 27
    }
  ];

  const recentExamples: TrainingExample[] = [
    {
      id: '1',
      title: 'EUR/USD Order Block Reaction',
      category: 'Order Blocks',
      symbol: 'EUR/USD',
      timeframe: '4H',
      outcome: 'hit_target',
      profitLoss: 85,
      imagePath: '/mock-pattern-1.png',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isValidated: true
    },
    {
      id: '2',
      title: 'GBP/USD Fair Value Gap Fill',
      category: 'Fair Value Gaps', 
      symbol: 'GBP/USD',
      timeframe: '1H',
      outcome: 'breakeven',
      profitLoss: 0,
      imagePath: '/mock-pattern-2.png',
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      isValidated: false
    },
    {
      id: '3',
      title: 'Bitcoin Support Break & Retest',
      category: 'Break of Structure',
      symbol: 'BTC/USD',
      timeframe: '1D',
      outcome: 'pending',
      profitLoss: 0,
      imagePath: '/mock-pattern-3.png',
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      isValidated: true
    }
  ];

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getCategoryIcon = (type: string) => {
    switch(type) {
      case 'smc': return <Brain className="w-4 h-4" />;
      case 'patterns': return <BarChart3 className="w-4 h-4" />;
      case 'confluence': return <Activity className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (type: string) => {
    switch(type) {
      case 'smc': return 'hsl(260 100% 70%)';
      case 'patterns': return 'hsl(120 60% 50%)';
      case 'confluence': return 'hsl(45 90% 60%)';
      default: return '';
    }
  };

  const getOutcomeIcon = (outcome: string) => {
    switch(outcome) {
      case 'hit_target': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'stopped_out': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'breakeven': return <Activity className="w-4 h-4 text-yellow-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-blue-500" />;
      default: return null;
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <BookOpen className="w-6 h-6" />
            Pattern Training Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            Train the SMC and patterns recognition system with your trading expertise
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {recentExamples.filter(e => e.isValidated).length} Validated
          </Badge>
          <Badge variant="outline" className="text-sm">
            {patternCategories.reduce((sum, cat) => sum + cat.count, 0)} Total Patterns
          </Badge>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Pattern
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Training History
          </TabsTrigger>
        </TabsList>

        {/* Upload Pattern Tab */}
        <TabsContent value="upload" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Image Upload Section */}
            <Card data-testid="card-image-upload">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Pattern Diagram
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Label htmlFor="image-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover-elevate transition-colors">
                      {uploadedImage ? (
                        <div className="space-y-4">
                          <img 
                            src={uploadedImage} 
                            alt="Uploaded pattern" 
                            className="max-w-full h-48 object-contain mx-auto rounded-md"
                          />
                          <p className="text-sm text-muted-foreground">
                            Click to replace image
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                          <div>
                            <p className="text-lg font-medium">Upload Pattern Screenshot</p>
                            <p className="text-sm text-muted-foreground">
                              JPG, PNG up to 10MB • Chart screenshots, pattern diagrams, annotated setups
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <Input
                      id="image-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                      data-testid="input-image-upload"
                    />
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Pattern Details Form */}
            <Card data-testid="card-pattern-details">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Pattern Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Pattern Title</Label>
                    <Input 
                      id="title" 
                      placeholder="e.g., EUR/USD Order Block Reaction"
                      data-testid="input-pattern-title"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category">Pattern Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger data-testid="select-pattern-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {patternCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(category.type)}
                              {category.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="symbol">Symbol</Label>
                      <Input 
                        id="symbol" 
                        placeholder="EUR/USD"
                        data-testid="input-symbol"
                      />
                    </div>
                    <div>
                      <Label htmlFor="timeframe">Timeframe</Label>
                      <Select>
                        <SelectTrigger data-testid="select-timeframe">
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1m">1M</SelectItem>
                          <SelectItem value="5m">5M</SelectItem>
                          <SelectItem value="15m">15M</SelectItem>
                          <SelectItem value="1h">1H</SelectItem>
                          <SelectItem value="4h">4H</SelectItem>
                          <SelectItem value="1d">1D</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Annotations Section */}
          <Card data-testid="card-annotations">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Pattern Annotations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <Label htmlFor="description">Pattern Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Describe what makes this pattern significant..."
                    className="min-h-20"
                    data-testid="textarea-description"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="key-points">Key Identification Points</Label>
                    <Textarea 
                      id="key-points" 
                      placeholder="• What signals to look for&#10;• Structure characteristics&#10;• Volume patterns"
                      className="min-h-24"
                      data-testid="textarea-key-points"
                    />
                  </div>

                  <div>
                    <Label htmlFor="confluence-factors">Confluence Factors</Label>
                    <Textarea 
                      id="confluence-factors" 
                      placeholder="• Multi-timeframe alignment&#10;• Economic news impact&#10;• Market sentiment"
                      className="min-h-24"
                      data-testid="textarea-confluence"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="entry">Entry Level</Label>
                    <Input 
                      id="entry" 
                      type="number" 
                      step="0.0001" 
                      placeholder="1.0845"
                      data-testid="input-entry-level"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stop-loss">Stop Loss</Label>
                    <Input 
                      id="stop-loss" 
                      type="number" 
                      step="0.0001" 
                      placeholder="1.0820"
                      data-testid="input-stop-loss"
                    />
                  </div>
                  <div>
                    <Label htmlFor="take-profit">Take Profit</Label>
                    <Input 
                      id="take-profit" 
                      type="number" 
                      step="0.0001" 
                      placeholder="1.0895"
                      data-testid="input-take-profit"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="outcome">Trade Outcome</Label>
                  <Select>
                    <SelectTrigger data-testid="select-outcome">
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hit_target">Hit Target</SelectItem>
                      <SelectItem value="stopped_out">Stopped Out</SelectItem>
                      <SelectItem value="breakeven">Breakeven</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea 
                    id="notes" 
                    placeholder="Any additional observations, lessons learned, or pattern variations..."
                    className="min-h-20"
                    data-testid="textarea-notes"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" data-testid="button-save-draft">
              Save as Draft
            </Button>
            <Button className="flex items-center gap-2" data-testid="button-submit-training">
              <Save className="w-4 h-4" />
              Submit for Training
            </Button>
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {patternCategories.map((category) => (
              <Card key={category.id} className="hover-elevate" data-testid={`card-category-${category.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant="secondary"
                      className="flex items-center gap-1"
                      style={{ backgroundColor: getCategoryColor(category.type) + '20', color: getCategoryColor(category.type) }}
                    >
                      {getCategoryIcon(category.type)}
                      {category.type.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {category.count} patterns
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <h3 className="font-semibold text-lg mb-2">{category.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                  <Button variant="outline" size="sm" className="w-full">
                    View Patterns
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Training History Tab */}
        <TabsContent value="history" className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Recent Training Examples</h3>
            
            {recentExamples.map((example) => (
              <Card key={example.id} className="hover-elevate" data-testid={`card-example-${example.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      </div>
                      
                      <div>
                        <h4 className="font-semibold">{example.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {example.category}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {example.symbol} • {example.timeframe} • {formatTimeAgo(example.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          {getOutcomeIcon(example.outcome)}
                          <span className="text-sm font-medium">
                            {example.outcome.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        {example.profitLoss !== 0 && (
                          <div className={`text-sm font-mono ${example.profitLoss > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {example.profitLoss > 0 ? '+' : ''}{example.profitLoss} pips
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {example.isValidated && (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Validated
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}